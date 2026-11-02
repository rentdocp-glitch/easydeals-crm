from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
S = 4
N = 512 * S
B = '/tmp/f/Poppins-Bold.ttf'
BL = (27, 117, 188)
OR = (255, 107, 0)

def word(t, col, size, cy, im):
    m = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(m)
    f = ImageFont.truetype(B, size * S)
    b = d.textbbox((0, 0), t, font=f)
    d.text((N / 2 - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), t, font=f, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(size * S // 45)).point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.GaussianBlur(1.5))
    im.paste(Image.new('RGB', (N, N), col), (0, 0), m)

im = Image.new('RGB', (N, N), 'white')
d = ImageDraw.Draw(im)
word('Easy', BL, 190, N * 0.45, im)
word('Deals', OR, 172, N * 0.72, im)
s = S
cx = N / 2
cy = N * 0.21
w = 105
d.polygon([(cx - w * 0.62 * s, cy + 8 * s), (cx, cy - w * 0.6 * s), (cx + w * 0.62 * s, cy + 8 * s)], fill=OR)
d.rectangle([cx - w * 0.46 * s, cy + 4 * s, cx + w * 0.46 * s, cy + w * 0.4 * s], fill=OR)
d.rectangle([cx - 13 * s, cy + w * 0.12 * s, cx + 13 * s, cy + w * 0.4 * s], fill='white')
big = im.resize((512, 512), Image.LANCZOS)
big.save('icon-512.png')
big.resize((192, 192), Image.LANCZOS).save('icon-192.png')
os.makedirs('android/app/src/main/res/drawable-nodpi', exist_ok=True)
big.save('android/app/src/main/res/drawable-nodpi/app_icon.png')
