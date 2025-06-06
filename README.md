# 5-Star Rating AI Flask App

A simple web application for generating 5-star Google Maps reviews using AI (OpenAI/GPT) in Vietnamese or English.

## Features

- 🌍 Input a Google Maps URL to extract the place name
- 🤖 Generate AI-powered 5-star reviews in Vietnamese or English
- ✍️ Choose review style: friendly, professional, enthusiastic, or concise
- 📝 Session-based review storage
- 📜 Logging to file

## Tech Stack

- **Backend**: Python 3.11, Flask
- **AI**: g4f (OpenAI-compatible client)
- **Logging**: Python logging with rotating file handler

## Prerequisites

- Python 3.10+
- Docker (optional, for containerization)
- OpenAI-compatible API key (if required by your g4f client)

## Project Structure

```
5-star-rating/
├── app.py              # Main Flask app
├── requirements.txt    # Python dependencies
├── Dockerfile          # Docker container definition
├── app.log             # Log file (auto-generated)
└── README.md           # This file
```

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/5-star-rating.git
cd 5-star-rating
```

### 2. Install dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Run the app

```bash
python app.py
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Docker Usage

### 1. Build the Docker image

```bash
docker build -t 5-star-rating .
```

### 2. Run the container

```bash
docker run -p 3000:3000 5-star-rating
```

---

## Environment Variables

- Edit `app.py` and set a secure `app.secret_key` before deploying to production.

---

## Example Usage

1. Open the app in your browser.
2. Paste a Google Maps URL.
3. Select language and style.
4. Click "Generate Review" to get an AI-written 5-star review.

---

## License

MIT License

---

## Acknowledgments

- [Flask](https://flask.palletsprojects.com/)
- [g4f](https://github.com/xtekky/gpt4free)
- [OpenAI](https://openai.com/)