import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.security import require_user, require_session

client=TestClient(app)

@pytest.fixture
def signed_in():
    app.dependency_overrides[require_user]=lambda:{"id":"test-user"}
    app.dependency_overrides[require_session]=lambda:"test-meeting"
    yield
    app.dependency_overrides.clear()

def test_health_is_public_and_does_not_expose_secrets():
    response=client.get('/health')
    assert response.status_code==200
    body=response.json()
    assert body['status']=='ok'
    assert 'meeting_storage' in body
    assert 'gemini_api_key' not in response.text.lower()
    assert 'SUPABASE_SERVICE_KEY' not in response.text

def test_meeting_creation_requires_supabase_session():
    response=client.post('/api/meetings',json={'source':'transcript','text':'meeting details'})
    assert response.status_code in {401,503}

def test_meeting_link_is_never_started(signed_in):
    response=client.post('/api/meetings/test12345/bot',headers={'X-Session-Token':'not-used'},json={'meeting_url':'https://meet.google.com/abc-defg-hij','consent':True})
    assert response.status_code==501
    assert response.json()['detail']['code']=='coming_soon'

def test_transcript_meeting_is_temporary(signed_in):
    response=client.post('/api/meetings',json={'source':'transcript','title':'Launch sync','meeting_date':'2026-10-26','text':'A transcript held only in memory.'})
    assert response.status_code==201
    data=response.json()
    assert data['meeting_id'] and data['session_token']
    from app.meetings.store import store
    item=store.get(data['meeting_id'])
    assert item is not None and item.owner_id=='test-user'
    assert item.raw_text=='A transcript held only in memory.'

def test_youtube_link_validation():
    from app.stt.youtube import normalize_public_youtube_url
    assert normalize_public_youtube_url('https://youtu.be/abcdefghijk?t=15')=='https://www.youtube.com/watch?v=abcdefghijk'
    with pytest.raises(Exception):
        normalize_public_youtube_url('https://example.com/watch?v=abcdefghijk')



def test_provider_error_is_not_replaced_with_demo_output(signed_in,monkeypatch):
    from app.main import extract_with_chain
    from app.providers.base import ProviderError
    async def fail(*args,**kwargs):
        raise ProviderError('upstream unavailable',kind='quota')
    monkeypatch.setattr('app.main.extract_with_chain',fail)
    created=client.post('/api/meetings',json={'source':'transcript','title':'Temporary','text':'[00:00:01] Speaker: We will review this next week.'})
    meeting_id=created.json()['meeting_id']
    response=client.get(f'/api/meetings/{meeting_id}/events')
    assert response.status_code==200
    assert 'event: error' in response.text
    assert 'usage limit' in response.text
    assert 'event: done' not in response.text
    from app.meetings.store import store
    store.delete(meeting_id)
