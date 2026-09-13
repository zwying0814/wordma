//! 时间工具。
//!
//! 全项目的时间戳统一是 epoch 毫秒的整数，绝不用 `Date` 之类会退化成字符串的类型。
//! 日期换算集中在这里：把文章的 `YYYY-MM-DD` 日期变成可直接参与 SQL 排序的整数，
//! 从而**不必在 SQL 里用 `julianday()`** 依赖 SQLite 的日期解析。
//!
//! 注意这里只有「日期 → 时间戳」这一个方向。反向（时间戳 → 日期）刻意不提供：
//! 手写实现只能按 UTC 折算，会把北京时间的凌晨记成前一天，而引入日期库只为
//! 这一个能力并不划算。需要日期的地方一律沿用已存的 `date` 字段
//! （创建文章时由前端按本地日期给出，见 `create-article-dialog.tsx`）。

use std::time::{SystemTime, UNIX_EPOCH};

/// 当前时间的 epoch 毫秒。
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `YYYY-MM-DD` → 自 epoch 起的毫秒（按 UTC 零点）。
///
/// 容忍后接时间部分（`2026-08-06T10:00`），只看前 10 个字符。
/// 无法识别时返回 `None`，由调用方回退到记录创建时间。
pub fn date_to_millis(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 10 {
        return None;
    }

    let num = |a: usize, z: usize| -> Option<i64> {
        std::str::from_utf8(&b[a..z]).ok()?.parse().ok()
    };
    let y = num(0, 4)?;
    let m = num(5, 7)?;
    let d = num(8, 10)?;

    if b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }

    Some(days_from_civil(y, m, d) * 86_400_000)
}

/// Howard Hinnant 的 `days_from_civil`：无需引日期库即可把日期转成自 epoch 起的天数。
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400; // [0, 399]
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_conversion_matches_known_dates() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(1970, 1, 2), 1);
        assert_eq!(days_from_civil(2000, 3, 1), 11017);
        assert_eq!(date_to_millis("2026-08-06"), Some(20671 * 86_400_000));
        assert_eq!(date_to_millis("2026-08-06T10:00"), Some(20671 * 86_400_000));
        assert_eq!(date_to_millis("坏日期"), None);
        assert_eq!(date_to_millis("2026-13-01"), None);
        assert_eq!(date_to_millis("2026/08/06"), None);
        assert_eq!(date_to_millis("2026-08"), None);
    }
}
