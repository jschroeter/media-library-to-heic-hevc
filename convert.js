const IMAGE_MIMES_TO_SKIP = ['image/heic'];
const VIDEO_CODECS_TO_SKIP = ['hvc1'];
const [INPUT_PATH, OUTPUT_PATH] = process.argv.slice(2);

import { exiftool } from 'exiftool-vendored';
import { readdir, stat, access, utimes, copyFile, rm, mkdir, constants } from 'node:fs/promises';
import { join, basename, format, parse } from 'node:path';
import { promisify } from "node:util";
import { exec } from "node:child_process";
const execPromise = promisify(exec);

const failedFiles = [];
const warnFiles = [];

async function getFiles(path, results = []) {
    let files = await readdir(path, { withFileTypes: true });
    for (let file of files) {
        let fullPath = join(path, file.name);
        if (file.isDirectory()) {
            await getFiles(fullPath, results);
        } else {
            if (basename(fullPath).startsWith('.')) {
                continue;
            }
            results.push(fullPath);
        }
    }
    return results;
}

async function getMediaInfo(path) {
    try {
        const exif = await exiftool.read(path);
        return exif;
    } catch (e) {
        console.error('   error while getting media info', e);
    }
}

async function throwIfFileExists(path) {
    let exists = false;
    try {
        await access(path);
        exists = true;
    } catch {}

    if (exists) {
        throw new Error('file already exists');
    }
}

async function checkFileSizes(file, outputPath) {
    const originalFileStats = await stat(file.path);
    const outputFileStats = await stat(outputPath);
    if (outputFileStats.size >= originalFileStats.size) {
        file.warning = `converted file "${outputPath}" is larger than original, please manually check which one you want to use`;
        console.warn('   ' + file.warning);
        warnFiles.push(file);
    }
}

function errorHandler(file, error) {
    file.error = error;
    console.error('   failed to process file', file.error);
    failedFiles.push(file);
}

async function buildOutputPath (parsedPath) {
    const dir = join(OUTPUT_PATH, parsedPath.dir);
    let outputPath = format({
        dir,
        name: parsedPath.name,
        ext: parsedPath.ext
    });

    await mkdir(dir, {
        recursive: true,
    });

    return outputPath;
}

async function convertVideo(file) {
    const parsedPath = parse(file.path);
    // if it's .mp4, use same container format to make sure meta data is kept. For all others, use .mov
    let ext = parsedPath.ext.toLowerCase();
    ext = ['.mov', '.mp4'].includes(ext) ? ext : '.mov';

    const outputPath = await buildOutputPath({
        ...parsedPath,
        ext
    });

    console.log(`   converting video to`, outputPath);

    try {
        await throwIfFileExists(outputPath);
        await execPromise(`ffmpeg -i "${file.path}" -c:v libx265 -x265-params preset=veryslow:crf=23 -vtag hvc1 -movflags faststart -n "${outputPath}"`);
        await setDateTime(outputPath, file.exif);
        await checkFileSizes(file, outputPath);
    } catch (e) {
        errorHandler(file, e);
    }
};

async function convertImage(file) {
    const parsedPath = parse(file.path);
    const outputPath = await buildOutputPath({
        ...parsedPath,
        ext: '.heic'
    });

    console.log(`   converting image to`, outputPath);

    try {
        await throwIfFileExists(outputPath);
        await execPromise(`magick "${file.path}" "${outputPath}"`);
        await setDateTime(outputPath, file.exif);
        await checkFileSizes(file, outputPath);
    } catch (e) {
        errorHandler(file, e);
    }
}

async function copyOriginalFile(file) {
    const parsedPath = parse(file.path);
    const outputPath = await buildOutputPath(parsedPath);

    console.log('   copying original file to', outputPath);
    try {
        await copyFile(file.path, outputPath, constants.COPYFILE_EXCL);
        await setDateTime(outputPath, file.exif);
    } catch (e) {
        errorHandler(file, e);
    }
}

async function setDateTime(outputPath, exif) {
    let date = exif.CreationDate || exif.DateTimeOriginal || exif.MediaCreateDate || exif.CreateDate || exif.FileModifyDate;
    if (!date.toDate) { // in case exiftool couldn't get the date
        date = exif.FileModifyDate;
    }
    const dateObject = date.toDate();
    console.log('   writing date', dateObject);
    try {
        await exiftool.write(outputPath, { AllDates: date });
        await utimes(outputPath, dateObject, dateObject);
         // TODO exiftool keeps a backup of the original file. With -overwrite_original CLI flag it should be possible to
         // prevent it but for some reason it didn't work. Therefore removing the file manually.
        await rm(outputPath + '_original');
    } catch (e) {
        console.error('   error while setting date', e);
    }
}




const files = await getFiles(INPUT_PATH);
const totalFiles = files.length;
console.log(`found ${totalFiles} files`);

for (const [index, filePath] of files.entries()) {
    const file = {
        path: filePath,
        exif: await getMediaInfo(filePath)
    };
    const failedStats = failedFiles.length ? ` (${failedFiles.length} failed)` : '';
    console.log(`file ${index + 1} of ${totalFiles}${failedStats}: ${file.path}`);

    let useOriginalFile = false;

    const { CompressorID, MIMEType } = file.exif;
    if (MIMEType.startsWith('image') && !IMAGE_MIMES_TO_SKIP.includes(MIMEType)) {
        console.log('   image:', MIMEType);
        await convertImage(file);
    } else if (MIMEType.startsWith('video') && !VIDEO_CODECS_TO_SKIP.includes(CompressorID)) {
        console.log('   video:', CompressorID);
        await convertVideo(file);
    } else {
        useOriginalFile = true;
    }

    if (useOriginalFile) {
        await copyOriginalFile(file);
    }
}

console.log(`Done! Processed ${totalFiles - failedFiles.length} of ${totalFiles} files`);

if (failedFiles.length) {
    console.warn('Errors:');
    failedFiles.forEach(file => {
        console.warn('   ', file.path, file.error);
    });
}

if (warnFiles.length) {
    console.warn('Warnings:');
    warnFiles.forEach(file => {
        console.warn('   ', file.path, file.warning);
    });
}

exiftool.end();