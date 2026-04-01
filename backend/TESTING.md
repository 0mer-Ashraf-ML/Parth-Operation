# Backend Testing

## Install

From [backend](/Users/omarashraf/Downloads/parth-project-stuff/Parth-Operation/backend):

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

## Run all backend tests

From the repo root:

```bash
pytest
```

From the backend directory:

```bash
cd backend
pytest ../backend/app/tests
```

## Run by suite type

Unit tests:

```bash
pytest -m unit
```

Integration tests:

```bash
pytest -m integration
```

End-to-end tests:

```bash
pytest -m e2e
```

## Notes

- The suite uses a disposable SQLite database per test.
- No external Postgres, S3, Gemini, or AI service is required for these tests.
- The tests target the current `dev` branch backend behavior.
