//! The kvman desktop app's shell (plan 14). It runs kvman as a program and holds no kvman logic: what it decides is in
//! `session`, and the modules beside it carry that out.

pub mod app;
pub mod commands;
pub mod downloads;
pub mod home;
pub mod kvman_api;
pub mod kvman_process;
pub mod lines;
pub mod messages;
pub mod navigation;
pub mod runtime;
pub mod session;
pub mod updates;
