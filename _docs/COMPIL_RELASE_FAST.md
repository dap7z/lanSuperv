# Compilation des executable principaux pour github release :
- windows 64 (electron)
- linux 64 (head less sea)
- linux arm64 (head less sea)

## Commandes à executer depuis environement de dev windows :

```bash
#POWERSHELL AS ADMINISTRATOR

cd lanSuperv
$env:GH_TOKEN="ghp_*********************************"
npm login
npm run build:electron:publish
```


```bash
#CMDER

cd lanSuperv

npm run build:sea:linux-64

#Connect via ssh to an arm64 machine (ex: RaspberryPi)
ssh -p ** *******@10.10.1.211 
cd ~/shared/apps/lanSupervGit 
npm run build:sea:linux-arm64
zip -r lanSuperv-1.0.0-linux-arm64.zip dist-sea
#then use ftp client to get lanSuperv-1.X.X-linux-arm64.zip
```

