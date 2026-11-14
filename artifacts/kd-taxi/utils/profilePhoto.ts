import * as ImageManipulator from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

export async function prepareProfilePhoto(asset: ImagePickerAsset): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(asset.uri,
    [{ resize: { width: Math.min(320, asset.width || 320) } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('PHOTO_PROCESSING_FAILED');
  return `data:image/jpeg;base64,${result.base64}`;
}
