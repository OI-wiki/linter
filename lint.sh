#!/bin/bash
echo $UID
echo $USER
echo $PATH
source /root/.bashrc

rm -rf 24OI/OI-wiki
git clone --depth=50 https://github.com/24OI/OI-wiki.git 24OI/OI-wiki

cd 24OI/OI-wiki
git fetch origin +refs/pull/$4/merge:
git checkout -qf FETCH_HEAD

npm install .

git config --local user.email "15963390+24OI-bot@users.noreply.github.com"
git config --local user.name "24OI-bot"

remark . -o

git add .
git commit -m 'style: format markdown files with remark-lint'
git remote add upd https://24OI-bot:$GH_TOKEN@github.com/$1/$2.git
git push upd $3
