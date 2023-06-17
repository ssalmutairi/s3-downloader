# s3-downloader

this repo is used to download all files from s3 bucket

## Features

- download all files from s3 bucket.
- resume download remaining files.

## requirements

- nodejs

here the steps to install and use this repo

```bash

# clone the repo
git clone https://github.com/ssalmutairi/s3-downloader.git
cd s3-downloader
cp .env.example .env

# edit variables
# BUCKET_NAME = ''
# ACCESS_KEY_ID = ''
# SECRET_ACCESS_KEY = ''

# install packages
npm install


# run the the generate.js this will connect to s3
# and get all resources from the bucket defined
# in .env then generate links.json contains array of object
# that contain file details (path,signedUrl)

node generate.js

# after is completed you can run app.js which will start download
# all files also can resume in case the code stop.

node app.js &

# the & helps to run the app in background
# all resources will be written in ./downloads folder


```
