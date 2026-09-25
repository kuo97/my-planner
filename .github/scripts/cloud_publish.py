# -*- coding: utf-8 -*-
"""찬작 인스타·쓰레드 클라우드 발행 (2026-09-25 신설) — GitHub Actions 에서 돈다.

찬진: *"만약 이동중이라 노트북을 늦게 킬 수 밖에 없는 상황일 때…"* → *"그래 그럼 깃허브로 운영해볼까?"*
노트북이 꺼져 있어도 인스타·쓰레드가 21:00 에 나가게 한다 (유튜브 publishAt 과 같은 효과).

큐 = 이 저장소의 **초안(draft) 릴리스**. 초안은 저장소 권한자만 보인다 — 발행 전 영상·캡션이 새지 않는다.
  태그 q-<슬롯id>, 본문 = JSON 메타, 첨부 = video.mp4.  노트북의 publish_cloud.py --stage 가 만든다.
실행: 발행 시각(due)이 지났고 **그날(KST) 안**이면 올린다. 날짜가 지나 버렸으면 올리지 않고 missed 로 남긴다
  (새벽 발행은 초기 반응이 없고, 다음 날 편과 겹친다 — 2026-09-25 찬진과 정한 규칙).
영상 공개 URL = 지금과 같은 방식 (media/ 에 잠깐 올려 Pages 로 열고, 게시 후 지운다).
결과 = cloud_log.json + publish.json(앱 '발행' 탭) 상태. 노트북 publish_sync.py 가 cloud_log 를 읽어 발행_일정.json 에 반영.
"""
import datetime as dt, json, os, subprocess, sys, time, urllib.parse, urllib.request, urllib.error

REPO = os.environ.get("GITHUB_REPOSITORY", "kuo97/my-planner")
GH = os.environ.get("GITHUB_TOKEN", "")
PAGES = "https://kuo97.github.io/my-planner/"
KST = dt.timezone(dt.timedelta(hours=9))
LOG = "cloud_log.json"


def now():
    return dt.datetime.now(KST)


def gh(method, path, body=None):
    url = path if path.startswith("http") else "https://api.github.com/repos/%s/%s" % (REPO, path)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + GH, "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else {}


def meta_api(url, data=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None,
                                 method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError("API %s: %s" % (e.code, e.read().decode()[:400]))


def git(*a):
    return subprocess.run(["git"] + list(a), capture_output=True, text=True)


def commit_push(paths, msg):
    git("add", "-A", *paths)
    if not git("status", "--porcelain", *paths).stdout.strip():
        return
    git("commit", "-q", "-m", msg)
    for _ in range(4):                      # 노트북도 같은 저장소에 push 한다 — 겹치면 rebase 후 재시도
        if git("push", "-q").returncode == 0:
            return
        git("pull", "-q", "--rebase")
    raise RuntimeError("git push 실패: " + msg)


def request_pages_build():
    try:
        gh("POST", "pages/builds")          # GITHUB_TOKEN push 는 Pages 빌드를 안 걸 수 있어 직접 요청
    except Exception as e:
        print("  pages 빌드 요청 실패(무시):", e)


def host(local, name):
    os.makedirs("media", exist_ok=True)
    dst = "media/" + name
    os.replace(local, dst) if os.path.abspath(local) != os.path.abspath(dst) else None
    commit_push(["media"], "media: " + name)
    request_pages_build()
    url = PAGES + "media/" + urllib.parse.quote(name)
    for i in range(48):
        try:
            if urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=15).status == 200:
                print("  공개 확인 %d초 -> %s" % ((i + 1) * 15, url))
                return url
        except Exception:
            pass
        time.sleep(15)
    raise RuntimeError("Pages 에 영상이 12분 안에 안 열렸다")


def unhost(name):
    p = "media/" + name
    if os.path.exists(p):
        os.remove(p)
        commit_push(["media"], "media: remove " + name)
        request_pages_build()


def publish_instagram(tok, url, caption):
    uid, t = tok["ig_user_id"], tok["access_token"]
    c = meta_api("https://graph.instagram.com/v21.0/%s/media" % uid,
                 {"media_type": "REELS", "video_url": url, "caption": caption, "access_token": t})
    for i in range(60):
        time.sleep(10)
        st = meta_api("https://graph.instagram.com/v21.0/%s?fields=status_code,status&access_token=%s" % (c["id"], t))
        if st.get("status_code") == "FINISHED":
            break
        if st.get("status_code") == "ERROR":
            raise RuntimeError("인스타 처리 실패: %s" % st.get("status"))
    else:
        raise RuntimeError("인스타 처리 10분 초과")
    return meta_api("https://graph.instagram.com/v21.0/%s/media_publish" % uid,
                    {"creation_id": c["id"], "access_token": t})["id"]


def publish_threads(tok, url, text, reply):
    uid, t = tok["threads_user_id"], tok["access_token"]
    c = meta_api("https://graph.threads.net/v1.0/%s/threads" % uid,
                 {"text": text, "media_type": "VIDEO", "video_url": url, "access_token": t})
    for _ in range(60):
        time.sleep(10)
        st = meta_api("https://graph.threads.net/v1.0/%s?fields=status&access_token=%s" % (c["id"], t))
        if st.get("status") == "FINISHED":
            break
        if st.get("status") == "ERROR":
            raise RuntimeError("쓰레드 처리 실패")
    else:
        raise RuntimeError("쓰레드 처리 10분 초과")
    mid = meta_api("https://graph.threads.net/v1.0/%s/threads_publish" % uid,
                   {"creation_id": c["id"], "access_token": t})["id"]
    rid = None
    if reply:
        r = meta_api("https://graph.threads.net/v1.0/%s/threads" % uid,
                     {"text": reply, "media_type": "TEXT", "reply_to_id": mid, "access_token": t})
        time.sleep(3)
        rid = meta_api("https://graph.threads.net/v1.0/%s/threads_publish" % uid,
                       {"creation_id": r["id"], "access_token": t})["id"]
    return mid, rid


def load_json(p, default):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return default


def record(slot_id, ch, status, **kw):
    """cloud_log.json(노트북이 읽음) + publish.json(앱이 읽음) 을 같이 고친다."""
    L = load_json(LOG, {"entries": []})
    e = {"slot_id": slot_id, "channel": ch, "status": status, "at": now().strftime("%Y-%m-%dT%H:%M:%S+09:00")}
    e.update({k: v for k, v in kw.items() if v})
    L["entries"].append(e)
    L["entries"] = L["entries"][-300:]
    json.dump(L, open(LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if status == "published":
        P = load_json("publish.json", None)
        if P:
            for s in P.get("slots", []):
                if s.get("id") == slot_id and ch in s.get("channels", {}):
                    s["channels"][ch].update({"status": "published", "at": e["at"]})
            json.dump(P, open("publish.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    commit_push([LOG, "publish.json"], "cloud: %s %s %s" % (slot_id, ch, status))


def token_warn():
    for key in ("IG_TOKEN_JSON", "TH_TOKEN_JSON"):
        d = json.loads(os.environ.get(key) or "{}")
        exp = d.get("expires")
        if exp and (dt.date.fromisoformat(exp) - now().date()).days <= 5:
            print("::warning::%s 만료 %s — 노트북에서 publish_cloud.py --stage 를 한 번 돌려 갱신할 것" % (key, exp))


def download_asset(rel):
    a = [x for x in rel.get("assets", []) if x["name"] == "video.mp4"]
    if not a:
        raise RuntimeError("video.mp4 첨부 없음")
    out = "_dl.mp4"
    r = subprocess.run(["curl", "-sSL", "--fail", "-o", out, "-H", "Authorization: Bearer " + GH,
                        "-H", "Accept: application/octet-stream", a[0]["url"]], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("영상 내려받기 실패: " + r.stderr[-200:])
    return out


def run(force_id=None):
    token_warn()
    rels = gh("GET", "releases?per_page=100")
    q = [r for r in rels if r.get("draft") and (r.get("tag_name") or "").startswith("q-")]
    t = now()
    print("큐 %d건 · 지금 %s KST" % (len(q), t.strftime("%m-%d %H:%M")))
    for rel in sorted(q, key=lambda r: r["tag_name"]):
        m = json.loads(rel["body"])
        due = dt.datetime.fromisoformat(m["due"])
        sid = m["slot_id"]
        if force_id and sid != force_id:
            continue
        if not force_id:
            if t < due:
                wait = (due - t).total_seconds()
                if wait > 600 or due.date() != t.date():
                    continue                      # 아직 멀었다 — 다음 실행에서
                print("  %s 발행 시각까지 %d초 대기" % (sid, wait))
                time.sleep(wait)
            elif due.date() != t.date():
                if not m.get("missed"):
                    print("  %s 날짜가 지났다(%s) — 올리지 않음" % (sid, m["due"][:10]))
                    for ch in m["channels"]:
                        if m["done"].get(ch) is None:
                            record(sid, ch, "missed", error="발행일이 지나 자동 발행 안 함")
                    m["missed"] = True
                    gh("PATCH", "releases/%d" % rel["id"], {"body": json.dumps(m, ensure_ascii=False)})
                continue
        todo = [ch for ch in m["channels"] if not m["done"].get(ch)]
        if not todo:
            gh("DELETE", "releases/%d" % rel["id"])
            continue
        print("▶ %s — %s" % (sid, ", ".join(todo)))
        name = "%d_%s.mp4" % (int(time.time()), sid.replace("_", "-"))
        url = None
        try:
            url = host(download_asset(rel), name)
            for ch in todo:
                try:
                    if ch == "instagram":
                        mid = publish_instagram(json.loads(os.environ["IG_TOKEN_JSON"]), url, m["ig_caption"])
                        rid = None
                    else:
                        mid, rid = publish_threads(json.loads(os.environ["TH_TOKEN_JSON"]), url,
                                                   m["th_caption"], m.get("th_reply"))
                    print("  [OK] %s %s" % (ch, mid))
                    m["done"][ch] = mid
                    # 채널 하나 끝날 때마다 초안에 적는다 — 중간에 죽어도 재실행 때 두 번 올리지 않는다
                    gh("PATCH", "releases/%d" % rel["id"], {"body": json.dumps(m, ensure_ascii=False)})
                    record(sid, ch, "published", media_id=mid, reply_id=rid)
                except Exception as e:
                    print("  [실패] %s: %s" % (ch, e))
                    record(sid, ch, "failed", error=str(e)[:300])
        finally:
            unhost(name)
        if all(m["done"].get(ch) for ch in m["channels"]):
            gh("DELETE", "releases/%d" % rel["id"])
            print("  큐에서 삭제")


def test_hosting():
    """게시 없이 Pages 호스팅만 시험한다 (workflow_dispatch mode=test)."""
    name = "%d_hosting-test.txt" % int(time.time())
    open("_t.txt", "w").write("ok")
    try:
        host("_t.txt", name)
        print("[OK] 호스팅 시험 통과")
    finally:
        unhost(name)


if __name__ == "__main__":
    git("config", "user.name", "chanjak-cloud")
    git("config", "user.email", "actions@users.noreply.github.com")
    mode = (sys.argv[1] if len(sys.argv) > 1 else "run")
    if mode == "test":
        test_hosting()
    else:
        run(force_id=sys.argv[2] if len(sys.argv) > 2 else None)
