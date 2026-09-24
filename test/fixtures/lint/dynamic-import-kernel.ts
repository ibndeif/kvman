export async function loadKernel(): Promise<unknown> {
  return import('@kvman/kernel');
}
