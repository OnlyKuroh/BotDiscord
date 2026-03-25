@echo off
cd /d "%~dp0dashboard-v2"
fly deploy -a itadori-dashboard
