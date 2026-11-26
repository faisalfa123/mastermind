//! Integration API Engine (`src/api/integration.rs`) & Centralized Reverse Proxy (`/p/<slug>/`).
use serde_json::{json, Value};
use std::io::Cursor;
use tiny_http::{Header, Method, Request, Response, StatusCode};

use crate::{auth, executor, store};
use subtle::ConstantTimeEq;

pub type Resp = Response<Cursor<Vec<u8>>>;

pub fn hdr(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

pub fn json_resp(code: u16, v: Value) -> Resp {
    let body = serde_json::to_vec(&v).unwrap_or_else(|_| b"{}".to_vec());
    Response::new(
        StatusCode(code),
        vec![
            hdr("Content-Type", "application/json"),
            hdr("Access-Control-Allow-Origin", "*"),
            hdr("Access-Control-Allow-Headers", "Content-Type, X-CSRF, X-Bumiayu-Bridge-Token, X-Bumiayu-Hall-Token"),
            hdr("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ],
        Cursor::new(body),
        None,
        None,
    )
}

pub fn verify_bridge_token(req: &Request, st: &mut store::Store) -> bool {
    let token_hdr = req.headers().iter()
        .find(|h| {
            h.field.as_str().as_str().eq_ignore_ascii_case("X-Bumiayu-Bridge-Token")
                || h.field.as_str().as_str().eq_ignore_ascii_case("X-Bumiayu-Hall-Token")
        })
        .map(|h| h.value.as_str())
        .unwrap_or("");
    let tok = st.state.hall_token.get_or_insert_with(|| auth::rand_hex(24)).clone();
    let _ = st.save();
    !token_hdr.is_empty() && bool::from(token_hdr.as_bytes().ct_eq(tok.as_bytes()))
}

/// `GET /api/v1/integration/manifest` — Read-Only manifest of active GUI WebApps for Bumiayu Hall.
pub fn handle_manifest(apps: Vec<(String, store::Installed)>) -> Resp {
    let list: Vec<Value> = apps.into_iter()
        .filter(|(id, a)| executor::validate_webapp(id, a.port).is_ok())
        .map(|(id, a)| {
            let st = executor::control_service(&id, "status").unwrap_or_else(|_| "inactive".into());
            json!({
                "name": id,
                "slug": id,
                "port": a.port,
                "proxy_path": format!("/p/{}/", id),
                "status": st,
                "running": st == "active",
                "icon": "globe"
            })
        })
        .collect();
    json_resp(200, json!({
        "version": env!("CARGO_PKG_VERSION"),
        "apps": list
    }))
}

/// `POST /api/v1/integration/control` — Execution-Only (`start|stop|restart`) via `executor.rs`.
pub fn handle_control(slug: &str, action: &str) -> Resp {
    if !matches!(action, "start" | "stop" | "restart") {
        return json_resp(400, json!({ "error": "invalid action (only start|stop|restart)" }));
    }
    match executor::control_service(slug, action) {
        Ok(msg) => json_resp(200, json!({ "ok": true, "slug": slug, "action": action, "message": msg })),
        Err(e) => json_resp(422, json!({ "error": e })),
    }
}

/// Centralized Reverse Proxy for `/p/<slug>/...` -> `http://127.0.0.1:<port>/...`.
pub fn handle_proxy(req: &Request, port: u16, subpath: &str) -> Resp {
    let target = format!("http://127.0.0.1:{port}/{subpath}");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(3))
        .timeout_read(std::time::Duration::from_secs(15))
        .build();
    let res = match req.method() {
        Method::Get => agent.get(&target).call(),
        _ => return json_resp(405, json!({ "error": "proxy method not supported" })),
    };
    match res {
        Ok(r) => {
            let status = r.status();
            let ct = r.header("Content-Type").unwrap_or("application/octet-stream").to_string();
            let mut buf = Vec::new();
            let _ = std::io::Read::read_to_end(&mut r.into_reader(), &mut buf);
            Response::new(
                StatusCode(status),
                vec![
                    hdr("Content-Type", &ct),
                    hdr("Content-Security-Policy", "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* http://100.*"),
                ],
                Cursor::new(buf),
                None,
                None,
            )
        }
        Err(e) => json_resp(502, json!({ "error": format!("upstream unreachable: {e}") })),
    }
}
