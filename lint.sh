#!/bin/bash
echo $UID
echo $USER
echo $PATH
# source /root/.bashrc

num=$RANDOM
git clone --depth=1 -b $3 https://github.com/$1/$2.git $num

cd $num

# rm yarn.lock
# rm package-lock.json
# cp /root/package.json .

# npm install .
# yarn add .

if [[ -f package-lock.json ]]; then
    npm install .
else
    yarn
fi

git config --local user.email "15963390+24OI-bot@users.noreply.github.com"
git config --local user.name "24OI-bot"

npx remark ./docs -o --silent
find . -type f -name "*.cpp" | xargs clang-format -i
# find . -type f -name "*.hpp" | xargs clang-format -i

git add ./docs
git commit -m 'style: format markdown files with remark-lint'
git remote add upd https://24OI-bot:$GH_TOKEN@github.com/$1/$2.git
git push upd $3

cd ..
rm -rf $num
yarn cache clean

