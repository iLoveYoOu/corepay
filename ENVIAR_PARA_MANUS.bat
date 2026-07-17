@echo off
echo --- STATUS DA PONTE --- > info_manus.txt
type .opencode-bridge\status.txt >> info_manus.txt
echo. >> info_manus.txt
echo --- RESULTADO DO OPENCODE --- >> info_manus.txt
if exist .opencode-bridge\result.md (type .opencode-bridge\result.md >> info_manus.txt) else (echo Sem resultado ainda >> info_manus.txt)
echo. >> info_manus.txt
echo --- ESTADO DO GIT --- >> info_manus.txt
git status -sb >> info_manus.txt
type info_manus.txt | clip
echo Dados copiados para a area de transferencia! Cole no chat com o Manus.
pause
