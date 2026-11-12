# GitHub: how our team works

One person (Adina) creates the repository `gym-booking-system` (Private, then add teammates in Settings > Collaborators).

## First upload
```
git init
git add .
git commit -m "Initial website: backend, database, frontend, tests"
git branch -M main
git remote add origin https://github.com/<user>/gym-booking-system.git
git push -u origin main
```
Check before `git add .`: the `.env` file must NOT be uploaded (it is in .gitignore).

## Every teammate
```
git clone https://github.com/<user>/gym-booking-system.git
cd gym-booking-system
git checkout -b naima/security     # your own branch: name/topic
# ...work on your files...
git add .
git commit -m "Add password rules"
git push -u origin naima/security
```
Then on GitHub press "Compare & pull request". Another teammate reviews, then "Merge". Before starting new work: `git checkout main && git pull`.

## Rules
1. Work only in your own files (see README table). Need a change in someone else's file? Ask them.
2. Small commits with clear messages (what changed).
3. Run `npm test` before every pull request: all tests must pass.
4. Never commit `.env`, passwords or `node_modules`.
