import sqlite3
import pytest
from app.ai_provider import reserve_call,AIUnavailable
from app.config import settings,Settings


def test_zero_disables_both_local_count_caps_without_removing_usage_records(monkeypatch):
    monkeypatch.setattr(settings,'ai_max_calls',0)
    monkeypatch.setattr(settings,'ai_calls_per_user_hour',0)
    for _ in range(115):
        reserve_call('same-account','test-only-no-provider')
    with sqlite3.connect(settings.ai_usage_path) as db:
        assert db.execute('SELECT count(*) FROM calls').fetchone()[0]==115
    assert Settings(ai_max_calls=0,ai_calls_per_user_hour=0).ai_calls_per_user_hour==0


def test_optional_hourly_cap_still_works_when_explicitly_enabled(monkeypatch):
    monkeypatch.setattr(settings,'ai_max_calls',0)
    monkeypatch.setattr(settings,'ai_calls_per_user_hour',1)
    reserve_call('account','test-only')
    with pytest.raises(AIUnavailable,match='hourly'):
        reserve_call('account','test-only')
    assert reserve_call('another-account','test-only')
