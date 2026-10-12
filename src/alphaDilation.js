//按最终像素对应的半径扩张连续 Alpha，保留半透明边缘。
export function dilateAlpha(mask, width, height, radius) {
  if (!radius) return mask;
  const horizontal = Buffer.alloc(mask.length), result = Buffer.alloc(mask.length);
  const queue = new Int32Array(Math.max(width, height));
  //水平与垂直各取滑动窗口最大值，避免二值化和随半径增长的多重遍历。
  for (let y = 0; y < height; y++) {
    let head = 0, tail = 0, right = -1;
    for (let x = 0; x < width; x++) {
      while (right < Math.min(width - 1, x + radius)) {
        right++;
        while (tail > head && mask[y * width + queue[tail - 1]] <= mask[y * width + right]) tail--;
        queue[tail++] = right;
      }
      while (queue[head] < x - radius) head++;
      horizontal[y * width + x] = mask[y * width + queue[head]];
    }
  }
  for (let x = 0; x < width; x++) {
    let head = 0, tail = 0, bottom = -1;
    for (let y = 0; y < height; y++) {
      while (bottom < Math.min(height - 1, y + radius)) {
        bottom++;
        while (tail > head && horizontal[queue[tail - 1] * width + x] <= horizontal[bottom * width + x]) tail--;
        queue[tail++] = bottom;
      }
      while (queue[head] < y - radius) head++;
      result[y * width + x] = horizontal[queue[head] * width + x];
    }
  }
  return result;
}
