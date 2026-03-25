@echo off
cd /d "%~dp0"
fly volumes create data --size 1 -r gru -a itadoritrue
