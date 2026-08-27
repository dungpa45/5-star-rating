import os
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, render_template
from dotenv import load_dotenv

load_dotenv()

from blueprints.youtube_review import youtube_review
from blueprints.map_review import map_review

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'hub-secret-key')

handler = RotatingFileHandler('app.log', maxBytes=1000000, backupCount=3)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s : %(message)s',
    handlers=[handler]
)

app.register_blueprint(youtube_review)
app.register_blueprint(map_review)


@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
