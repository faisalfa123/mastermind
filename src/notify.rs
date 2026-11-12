//! Notifications: ntfy, Telegram, SMTP email. Failures never block the caller.
use crate::config::Config;
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use std::time::Duration;

pub fn send(cfg: &Config, title: &str, body: &str) {
    let (cfg, title, body) = (cfg.clone(), title.to_string(), body.to_string());
    // Fire and forget so a slow channel can't stall request handling.
    std::thread::spawn(move || send_blocking(&cfg, &title, &body));
}

pub fn send_blocking(cfg: &Config, title: &str, body: &str) -> Vec<String> {
    let mut errs = Vec::new();
    let t = Duration::from_secs(10);
    if let Some(n) = &cfg.ntfy {
        let mut r = ureq::post(&format!("{}/{}", n.url.trim_end_matches('/'), n.topic)).set("Title", title).timeout(t);
        if let Some(tok) = &n.token { r = r.set("Authorization", &format!("Bearer {tok}")); }
        if let Err(e) = r.send_string(body) { errs.push(format!("ntfy: {e}")); }
    }
    if let Some(tg) = &cfg.telegram {
        let url = format!("https://api.telegram.org/bot{}/sendMessage", tg.bot_token);
        let text = format!("{title}\n{body}");
        if let Err(e) = ureq::post(&url).timeout(t).send_json(serde_json::json!({"chat_id": tg.chat_id, "text": text})) {
            errs.push(format!("telegram: {}", e.to_string().replace(&tg.bot_token, "***")));
        }
    }
    if let Some(r) = &cfg.resend {
        let res = {
            let body_json = serde_json::json!({
                "from": "Mastermind <onboarding@resend.dev>",
                "to": [&r.to],
                "subject": format!("[Mastermind] {title}"),
                "text": body,
            });
            let resp = ureq::post("https://api.resend.com/emails")
                .set("Authorization", &format!("Bearer {}", r.api_key))
                .set("Content-Type", "application/json")
                .timeout(t)
                .send_json(body_json);
            match resp {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("resend: {e}")),
            }
        };
        if let Err(e) = res { errs.push(e); }
    }
    if let Some(s) = &cfg.smtp {
        let res = (|| -> Result<(), String> {
            let m = Message::builder()
                .from(s.from.parse::<Mailbox>().map_err(|e| e.to_string())?)
                .to(s.to.parse::<Mailbox>().map_err(|e| e.to_string())?)
                .subject(format!("[Mastermind] {title}"))
                .body(body.to_string())
                .map_err(|e| e.to_string())?;
            let mailer = SmtpTransport::relay(&s.host).map_err(|e| e.to_string())?
                .port(s.port).credentials(Credentials::new(s.user.clone(), s.password.clone())).timeout(Some(t)).build();
            mailer.send(&m).map(|_| ()).map_err(|e| e.to_string())
        })();
        if let Err(e) = res { errs.push(format!("smtp: {e}")); }
    }
    errs
}
