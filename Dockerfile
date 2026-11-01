FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY frontend frontend

EXPOSE 8000
WORKDIR /app/backend

# 单进程多线程：SQLite 单文件，多 worker 并发写会锁库；
# timeout 放到 600s，因为思考型模型排队可能好几分钟。
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 600"]
