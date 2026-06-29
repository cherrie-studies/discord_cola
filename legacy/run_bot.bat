@echo off
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
call .venv\Scripts\activate.bat
python bot.py
pause
