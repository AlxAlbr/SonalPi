





//Lecture des données audio
    
// Inclure ffmpeg.wasm via un CDN ou un import
//import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

//const ffmpeg = createFFmpeg({ log: true });


async function convertAudio(inputFile) {
  await ffmpeg.load();
  ffmpeg.FS('writeFile', 'input.mp3', await fetchFile(inputFile));
  await ffmpeg.run('-i', 'input.mp3', '-ac', '1', '-ar', '8000', 'output.wav');
  const data = ffmpeg.FS('readFile', 'output.wav');
  // data est un Uint8Array contenant le fichier WAV
  // Vous pouvez ensuite le télécharger ou le traiter
  return data;
}


// résumés des données audio
function simplifySamples(samples, targetLength) {
  const factor = Math.floor(samples.length / targetLength);
  const reduced = [];
  for (let i = 0; i < targetLength; i++) {
    const start = i * factor;
    const end = start + factor;
    const segment = samples.slice(start, end);
    reduced.push(Math.max(...segment.map(Math.abs))); // Maximum absolu
  }
  return reduced;
}




// affichage des données audio
function displayAudioData(data) {
  const canvas = document.getElementById('audioCanvas');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  
  data.forEach((value, index) => {
    const x = (index / data.length) * width;
    const y = (1 - value) * height; // Inverser pour que le haut soit le maximum
    ctx.lineTo(x, y);
  });

  ctx.strokeStyle = 'blue';
  ctx.lineWidth = 2;
  ctx.stroke();
}



 