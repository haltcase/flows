#!/bin/bash -i

cat << EOF >> ~/.bash_aliases
alias cls=clear
alias pn=pnpm
alias pne='pnpm exec'
alias pnx='pnpm dlx'
EOF

# install fnm
curl -fsSL https://fnm.vercel.app/install | bash
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.bashrc
echo 'fnm install > /dev/null 2>&1 && fnm use --install-if-missing > /dev/null 2>&1' >> ~/.bashrc

source /home/vscode/.bashrc

corepack install && corepack enable pnpm
