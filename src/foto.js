// Reduce la foto a 1280 px de lado mayor y la guarda como JPEG.
// Al redibujarla en un canvas se pierden los datos EXIF (por ejemplo, la ubicación del celular).
export async function comprimirFoto(archivo, maxLado = 1280, calidad = 0.7) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((ok, fallo) =>
    canvas.toBlob((blob) => (blob ? ok(blob) : fallo(new Error('No se pudo procesar la foto.'))), 'image/jpeg', calidad)
  );
}
