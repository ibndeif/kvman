//! A fake kvman for the shell's API tests: it answers the routes a test names on 127.0.0.1 and records each request.
#![allow(dead_code, clippy::unwrap_used, clippy::expect_used)]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug, Clone)]
pub struct Request {
    pub line: String,
    pub headers: HashMap<String, String>,
    pub body: String,
}

pub struct FakeKvman {
    pub port: u16,
    requests: Arc<Mutex<Vec<Request>>>,
}

pub const NOT_FOUND: &str = r#"{"ok":false,"problem":{"code":"NOT_FOUND","message":"No such workspace.","params":{"thing":"workspace"}}}"#;

pub fn output(value: &str) -> String {
    format!(r#"{{"ok":true,"output":{value},"jobId":"job-1"}}"#)
}

pub fn workspaces(rows: &[(&str, &str, &str)]) -> String {
    let listed: Vec<String> = rows.iter().map(|(id, name, path)| format!(r#"{{"id":"{id}","name":"{name}","path":"{path}"}}"#)).collect();
    output(&format!("[{}]", listed.join(",")))
}

pub fn settings(values: &[(&str, &str)]) -> String {
    let listed: Vec<String> = values
        .iter()
        .map(|(key, value)| format!(r#"{{"key":"{key}","description":"A setting.","schema":{{}},"scopes":["global"],"value":"{value}","source":"global"}}"#))
        .collect();
    output(&format!("[{}]", listed.join(",")))
}

pub fn catalog(texts: &[(&str, &str)]) -> String {
    let listed: Vec<String> = texts.iter().map(|(key, text)| format!(r#""{key}":"{text}""#)).collect();
    format!(r#"{{"ok":true,"catalog":{{{}}}}}"#, listed.join(","))
}

fn read_request(stream: &TcpStream) -> Request {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let mut headers = HashMap::new();
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).unwrap();
        let Some((name, value)) = header.trim_end().split_once(':') else { break };
        headers.insert(name.to_lowercase(), value.trim().to_owned());
    }
    let length: usize = headers.get("content-length").map_or(0, |value| value.parse().unwrap());
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    Request {
        line: line.trim_end().to_owned(),
        headers,
        body: String::from_utf8(body).unwrap(),
    }
}

impl FakeKvman {
    /// `answers` maps a path, such as `/api/queries/kernel.workspace.list`, to the bodies it answers in turn; the last
    /// one is repeated.
    pub fn start(answers: &[(&str, &[String])]) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&requests);
        let mut answers: HashMap<String, Vec<String>> = answers.iter().map(|(path, bodies)| ((*path).to_owned(), bodies.to_vec())).collect();
        thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let request = read_request(&stream);
                let path = request.line.split(' ').nth(1).unwrap_or_default().to_owned();
                recorded.lock().unwrap().push(request);
                let body = match answers.get_mut(&path) {
                    Some(bodies) if bodies.len() > 1 => bodies.remove(0),
                    Some(bodies) => bodies[0].clone(),
                    None => NOT_FOUND.to_owned(),
                };
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });
        Self { port, requests }
    }

    pub fn requests(&self) -> Vec<Request> {
        self.requests.lock().unwrap().clone()
    }

    /// The bodies sent to a path, in order.
    pub fn bodies(&self, path: &str) -> Vec<String> {
        self.requests()
            .into_iter()
            .filter(|request| request.line.split(' ').nth(1) == Some(path))
            .map(|request| request.body)
            .collect()
    }
}

pub const LIST: &str = "/api/queries/kernel.workspace.list";
pub const OPEN: &str = "/api/commands/kernel.workspace.open";
pub const CLOSE: &str = "/api/commands/kernel.workspace.close";
pub const SETTINGS: &str = "/api/queries/kernel.settings.list";
