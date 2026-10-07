//! The shell's calls to kvman's HTTP API (plan 04, plan 14 §14.5). They go to `127.0.0.1:<port>` with no `Origin`
//! header, which the listener's checks pass (§4.2), and every answer is read into a typed shape (ADR 0038, 37).

use std::collections::HashMap;

use reqwest::blocking::Client;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::lines::Problem;

#[derive(Debug, Clone, PartialEq)]
pub enum ApiFailure {
    Problem(Problem),
    /// kvman didn't answer, or answered something that isn't the envelope.
    Unreadable,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: Value,
}

pub struct KvmanApi {
    base: String,
    client: Client,
}

fn typed<Output: DeserializeOwned>(value: Value) -> Result<Output, ApiFailure> {
    serde_json::from_value(value).map_err(|_| ApiFailure::Unreadable)
}

/// The part named `field` of a `{ ok: true, … }` answer, or the Problem of a `{ ok: false, problem }` one.
fn answer(mut envelope: Value, field: &str) -> Result<Value, ApiFailure> {
    match envelope.get("ok").and_then(Value::as_bool) {
        Some(true) => envelope.get_mut(field).map(Value::take).ok_or(ApiFailure::Unreadable),
        Some(false) => Err(envelope
            .get_mut("problem")
            .map(Value::take)
            .map_or(ApiFailure::Unreadable, |problem| typed(problem).map_or(ApiFailure::Unreadable, ApiFailure::Problem))),
        None => Err(ApiFailure::Unreadable),
    }
}

impl KvmanApi {
    pub fn new(port: u16) -> Result<Self, ApiFailure> {
        // No proxy: a proxy from the environment must never carry a call that is meant for this machine.
        let client = Client::builder().no_proxy().build().map_err(|_| ApiFailure::Unreadable)?;
        Ok(Self {
            base: format!("http://127.0.0.1:{port}"),
            client,
        })
    }

    fn call(&self, route: &str, input: Value) -> Result<Value, ApiFailure> {
        let response = self
            .client
            .post(format!("{}/api/{route}", self.base))
            .json(&json!({ "input": input }))
            .send()
            .map_err(|_| ApiFailure::Unreadable)?;
        answer(response.json().map_err(|_| ApiFailure::Unreadable)?, "output")
    }

    pub fn workspaces(&self) -> Result<Vec<Workspace>, ApiFailure> {
        typed(self.call("queries/kernel.workspace.list", json!({}))?)
    }

    pub fn open_workspace(&self, path: &str) -> Result<Workspace, ApiFailure> {
        typed(self.call("commands/kernel.workspace.open", json!({ "path": path }))?)
    }

    pub fn close_workspace(&self, workspace_id: &str) -> Result<(), ApiFailure> {
        self.call("commands/kernel.workspace.close", json!({ "workspaceId": workspace_id })).map(|_| ())
    }

    pub fn settings(&self) -> Result<Vec<Setting>, ApiFailure> {
        typed(self.call("queries/kernel.settings.list", json!({}))?)
    }

    pub fn catalog(&self, language: &str) -> Result<HashMap<String, String>, ApiFailure> {
        let response = self
            .client
            .get(format!("{}/api/locales/{language}", self.base))
            .send()
            .map_err(|_| ApiFailure::Unreadable)?;
        typed(answer(response.json().map_err(|_| ApiFailure::Unreadable)?, "catalog")?)
    }
}
