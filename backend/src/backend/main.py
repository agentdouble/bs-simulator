import uvicorn


def main() -> None:
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8055, reload=True)


if __name__ == "__main__":
    main()
