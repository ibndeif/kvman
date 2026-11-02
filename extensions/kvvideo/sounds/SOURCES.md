# kvvideo's sound effects

kvvideo made these four sounds itself with ffmpeg (plan 16 §16.8, ADR 0115, 62). They are released under CC0 1.0
(public domain): https://creativecommons.org/publicdomain/zero/1.0/

Each was made as 48 kHz mono 16-bit PCM from the source below, then turned up or down so its peak is −3 dBFS.

| File | Length | Source (`ffmpeg -f lavfi -i <source> -af <filters> -ac 1 -ar 48000 -c:a pcm_s16le`) |
|---|---|---|
| `click.wav` | 45 ms | `aevalsrc='0.6*sin(2*PI*2400*t)*exp(-t*180)+0.4*(random(0)-0.5)*exp(-t*320)':d=0.045:s=48000`, filters `highpass=f=900` |
| `keys.wav` | 2.07 s, a loop of key taps every 115 ms | `aevalsrc='(random(0)-0.5)*exp(-mod(t,0.115)*380)*(0.7+0.3*sin(2*PI*t*0.9))':d=2.07:s=48000`, filters `highpass=f=1800,lowpass=f=9000` |
| `whoosh.wav` | 550 ms | `aevalsrc='(random(0)-0.5)*pow(sin(PI*t/0.55),2)':d=0.55:s=48000`, filters `highpass=f=250,lowpass=f=2600` |
| `pop.wav` | 140 ms | `aevalsrc='0.9*sin(2*PI*(380*t+2600*t*t))*exp(-t*38)':d=0.14:s=48000`, filters `afade=t=in:d=0.004` |
