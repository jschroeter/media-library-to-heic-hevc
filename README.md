# Convert media library to HEIC/HEVC

This is a simple script to convert a media library with images and videos into more efficient formats without noticable quality loss nor loosing meta data like EXIF information.

HEIC images are compressed way more efficient compared to JPG. Same goes for videos, HEVC is way more efficient compared to e.g. H.264 or MPEG-2.

This script might also be useful when e.g. migrating from Adobe Lightroom to Apple Photos.

## Features
- converts non-HEIC images to HEIC while preserving meta data
- converts non-HEVC videos to HEVC while preserving meta data
- keeps original files in case they already do have the wanted format
- sets EXIF date and file modify date to date if found in meta data, otherwise fall back to file modify date
- keeps original folder structure, meaning input can be nested folders and output will have the same
- shows a warning if output file is larger then original file (it happens rarely, mostly for videos)

## Requirements
The script expects the following to be available:
- NodeJS
- ffmpeg
- imagemagick

then install dependencies by calling

````
npm i
````


## Usage

````
npm run convert <inputFolder> <outputFolder>
````

## Notes for migrating from Adobe Lightroom Classic to Apple Photos
- make sure your Lightroom catalog is in sync with the file system (just in case you've added files via other applications)
- make sure all photos have EXIF capture date set. Even if Lightroom sorts them correctly, it can be that no capture date is set and it only uses the file modify date. In this case it won't export the date correctly.
  - you can use ['Any Filter' Lightroom plugin](https://community.adobe.com/t5/lightroom-classic-discussions/filter-out-photos-without-capture-date-and-time/td-p/8811145#M35588) to be able to filter all files without date
- for each Lightroom collection, select all photos and add a keyword with the name of the collection (so you can later filter by these keywords again and create an album in e.g. Apple Photos)
- do the same for each of the star ratings (add keyword e.g. '1 star')
- use ['Folder Publisher' Lightroom plugin](http://regex.info/blog/lightroom-goodies/folder-publisher) to export while keeping the folder structure
- in case you have HEIC images in your library and you want to keep e.g. depth information, export them as original files
- now export images as JPG (100% quality) or PNG (8 bit), make sure including all meta data, and videos as original files

## Notes for old videos
- older videos might be interlaced, meaning you'll see some strange lines in the video. If so, you can manually convert them with de-interlace filter `yadif`:
  
  ```ffmpeg -i in.vob -vf yadif -c:v libx265 -x265-params preset=veryslow:crf=23 -vtag hvc1 -movflags faststart -n out.mov```