"""S2 security regression tests: CORS restrictions and auth endpoint protection."""


class TestCorsPolicy:
    def test_allows_null_origin_for_electron(self, client):
        res = client.options(
            "/tasks",
            headers={
                "Origin": "null",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "null"

    def test_allows_vite_dev_origin(self, client):
        res = client.options(
            "/tasks",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_blocks_unknown_origin(self, client):
        res = client.options(
            "/tasks",
            headers={
                "Origin": "https://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        # Starlette CORS returns 400 for disallowed preflight.
        assert res.status_code == 400
        assert "access-control-allow-origin" not in res.headers

    def test_preflight_still_works_when_pin_is_set(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})

        allowed = client.options(
            "/tasks",
            headers={
                "Origin": "null",
                "Access-Control-Request-Method": "GET",
            },
        )
        blocked = client.options(
            "/tasks",
            headers={
                "Origin": "https://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )

        assert allowed.status_code == 200
        assert allowed.headers.get("access-control-allow-origin") == "null"
        assert blocked.status_code == 400


class TestAuthEndpointsWithPin:
    def test_auth_start_rejects_without_token_when_pin_set(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})

        res = client.post(
            "/auth/start",
            json={"api_id": 12345, "api_hash": "abc123", "phone": "+10000000000"},
        )

        assert res.status_code == 401

    def test_auth_verify_rejects_without_token_when_pin_set(self, client):
        client.post("/auth/pin/set", json={"pin": "1234"})

        res = client.post("/auth/verify", json={"code": "00000"})

        assert res.status_code == 401
