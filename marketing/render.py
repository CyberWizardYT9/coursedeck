"""Build CourseDeck promo assets from real, fictional-data UI captures.

python marketing/render.py --out <directory> --stills
python marketing/render.py --out <directory> --video wide --audio-source <original.mp4>
python marketing/render.py --out <directory> --video vertical --audio-source <original.mp4>

Requires Pillow, NumPy and imageio-ffmpeg. The source audio is stream-copied,
without volume, timing, fades, or encoding changes. No third-party content is
downloaded. Captures are made using the app's local fixture preview.
"""
from pathlib import Path
from functools import lru_cache
import argparse, math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FONT_ROOT = Path('C:/Windows/Fonts')
NAVY, BLUE, INK, WHITE, MUTED = '#101c35', '#4568d6', '#182844', '#ffffff', '#aab9d8'
FPS, FRAMES = 60, 1822
MARKS = [0, 5.061, 7.591, 13.284, 16.446, 19.609, 22.772, 25.302, FRAMES/FPS]
FEATURES = {
    2: ('See what’s\ndue today.', 'Assignments from every class.', 'today'),
    3: ('Keep old work\nout of the way.', 'Past reminders stay easy to find.', 'quiet'),
    4: ('Find the week’s\nhomework.', 'Open your teachers’ weekly plans.', 'plans'),
    5: ('Check\nreturned work.', 'Grades and teacher feedback.', 'grades'),
}

@lru_cache(None)
def font(size, bold=False):
    return ImageFont.truetype(str(FONT_ROOT / ('segoeuib.ttf' if bold else 'segoeui.ttf')), round(size))

def text(layer, xy, value, size, color=WHITE, bold=False, anchor=None, spacing=12):
    d = ImageDraw.Draw(layer)
    d.multiline_text(xy, value, font=font(size,bold), fill=color, spacing=spacing, anchor=anchor)

def center(layer, y, value, size, color=WHITE, bold=False):
    d = ImageDraw.Draw(layer); f=font(size,bold)
    box=d.textbbox((0,0),value,font=f)
    d.text(((layer.width-(box[2]-box[0]))/2,y),value,font=f,fill=color)

def fit_text(layer, xy, value, max_size, width, color=WHITE, bold=False):
    size=max_size
    while ImageDraw.Draw(layer).textbbox((0,0),value,font=font(size,bold))[2]>width: size-=1
    text(layer,xy,value,size,color,bold)

def rounded(im, radius):
    mask=Image.new('L',im.size,0); ImageDraw.Draw(mask).rounded_rectangle((0,0,im.width-1,im.height-1),radius,fill=255)
    result=im.convert('RGBA'); result.putalpha(mask); return result

@lru_cache(None)
def logo(size):
    return Image.open(ROOT.parent/'icons/mark-256.png').convert('RGBA').resize((size,size),Image.Resampling.LANCZOS)

@lru_cache(None)
def capture(name, portrait=False):
    p=ROOT/'captures'/f'{name}{"-vertical" if portrait else ""}.png'
    if not p.exists(): p=ROOT/'captures'/f'{name}.png'
    im=Image.open(p).convert('RGB')
    # Remove only the local preview banner. Every composition labels demo data.
    if name!='quiet': im=im.crop((0,28,im.width,im.height))
    return im

@lru_cache(None)
def stage(w,h,light=False):
    yy,xx=np.mgrid[0:h,0:w]
    if light:
        base=np.zeros((h,w,3),dtype=np.float32); base[:]=[239,243,253]
        glow=np.exp(-(((xx-w*.75)/(w*.7))**2+((yy-h*.35)/(h*.8))**2))
        base += glow[:,:,None]*np.array([8,7,2])
    else:
        base=np.zeros((h,w,3),dtype=np.float32); base[:]=[13,22,42]
        glow=np.exp(-(((xx-w*.25)/(w*.65))**2+((yy-h*.05)/(h*.65))**2)*2)
        base += glow[:,:,None]*np.array([22,36,74])
    return Image.fromarray(np.uint8(np.clip(base,0,255))).convert('RGBA')

def paste_alpha(base,layer,x,y,alpha=1):
    if alpha<=0:return
    if alpha<1:
        layer=layer.copy(); layer.putalpha(layer.getchannel('A').point(lambda v:round(v*alpha)))
    base.alpha_composite(layer,(round(x),round(y)))

def product(name,width,portrait=False):
    shot=capture(name,portrait)
    h=round(shot.height*width/shot.width)
    shot=shot.resize((width,h),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(width+56,h+96))
    shadow=Image.new('RGBA',canvas.size)
    ImageDraw.Draw(shadow).rounded_rectangle((24,25,width+32,h+84),20,fill=(0,0,0,45))
    shadow=shadow.filter(ImageFilter.GaussianBlur(16)); canvas.alpha_composite(shadow)
    window=Image.new('RGBA',(width,h+34),'#ffffff')
    d=ImageDraw.Draw(window); d.rectangle((0,0,width,34),fill='#eef1f8')
    for i,c in enumerate(['#c8d1e1','#c8d1e1','#c8d1e1']):d.ellipse((16+i*17,13,23+i*17,20),fill=c)
    text(window,(86,8),'Coursedeck',13,'#63708a')
    window.paste(shot,(0,34))
    canvas.alpha_composite(rounded(window,14),(28,24)); return canvas

@lru_cache(None)
def product_layer(name,width,portrait=False):return product(name,width,portrait)

def ease(t):return 1-(1-max(0,min(1,t)))**4

def video_frame(t,portrait=False):
    w,h=(1080,1920) if portrait else (1920,1080)
    k=next((i for i in range(8) if MARKS[i]<=t<MARKS[i+1]),7)
    u=t-MARKS[k]; duration=MARKS[k+1]-MARKS[k]; enter=ease(u/.6)
    base=stage(w,h).copy(); layer=Image.new('RGBA',(w,h))
    margin=76 if portrait else 96
    if k not in (1,6,7):
        layer.alpha_composite(logo(46),(margin,64 if portrait else 58))
        text(layer,(margin+62,67 if portrait else 62),'Coursedeck',27,WHITE,True)
    if k==0:
        if portrait:
            for j,line in enumerate(['Assignments.','Due dates.','One place.']):
                a=ease((u-j*1.05)/.55); l=Image.new('RGBA',(w,h)); text(l,(76,490+j*142),line,100,WHITE if j<2 else '#91adff',True)
                paste_alpha(layer,l,0,round(30*(1-a)),a)
            text(layer,(80,1090),'Your Canvas classes, together.',39,MUTED)
        else:
            for j,line in enumerate(['Assignments.','Due dates.','One place.']):
                a=ease((u-j*1.05)/.55); l=Image.new('RGBA',(w,h)); text(l,(100,230+j*155),line,128,WHITE if j<2 else '#91adff',True)
                paste_alpha(layer,l,0,round(28*(1-a)),a)
            text(layer,(1080,548),'Your Canvas classes,\ntogether.',57,MUTED,False,spacing=18)
            ImageDraw.Draw(layer).line((1030,290,1030,745),fill='#384e78',width=2)
    elif k==1:
        size=220 if portrait else 166; x=(w-size)//2; y=480 if portrait else 220
        layer.alpha_composite(logo(size),(x,y))
        center(layer,y+size+42,'Coursedeck',92 if portrait else 82,WHITE,True)
        center(layer,y+size+174,'Your Canvas student planner.',42,MUTED)
    elif k in FEATURES:
        title,sub,name=FEATURES[k]
        if portrait:
            text(layer,(76,178),title,80,WHITE,True,spacing=4)
            fit_text(layer,(80,414),sub,33,920,MUTED)
            card=product_layer(name,914,True)
            if card.height>1200:card=card.resize((round(card.width*1200/card.height),1200),Image.Resampling.LANCZOS)
            # Keep the product in a browser frame, rather than implying a phone app.
            paste_alpha(layer,card,(w-card.width)/2,525+24*(1-enter))
            text(layer,(80,1795),'CHROME EXTENSION  ·  DEMO DATA',22,MUTED)
        else:
            text(layer,(96,326),title,76,WHITE,True,spacing=8)
            # Short, explicit captions with generous reading time.
            subs={'today':'Assignments from\nevery class.','quiet':'Past reminders stay\neasy to find.','plans':'Open your teachers’\nweekly plans.','grades':'Grades and\nteacher feedback.'}
            text(layer,(100,586),subs[name],34,MUTED,spacing=10)
            card=product_layer(name,1180)
            paste_alpha(layer,card,652,122+24*(1-enter))
            text(layer,(690,965),'ACTUAL INTERFACE  ·  FICTIONAL DEMO DATA',19,MUTED)
    elif k==6:
        y=600 if portrait else 340
        center(layer,y,'No extra account.',86 if portrait else 110,WHITE,True)
        center(layer,y+160,'Use your Canvas sign-in.',43 if portrait else 54,MUTED)
        center(layer,y+260,'Your dashboard stays on this computer.',31 if portrait else 34,MUTED)
    else:
        if portrait:
            layer.alpha_composite(logo(170),(455,270))
            center(layer,488,'Your Canvas classes.',76,WHITE,True)
            center(layer,598,'One simple planner.',76,'#91adff',True)
            rect=(100,930,980,1068)
            ImageDraw.Draw(layer).rounded_rectangle(rect,26,fill=BLUE)
            center(layer,972,'Get Coursedeck for Chrome',43,WHITE,True)
            center(layer,1140,'Free  ·  Open source',34,MUTED)
            center(layer,1650,'By CyberWizard',25,MUTED)
        else:
            layer.alpha_composite(logo(154),(883,130))
            center(layer,325,'Your Canvas classes.',94,WHITE,True)
            center(layer,443,'One simple planner.',94,'#91adff',True)
            ImageDraw.Draw(layer).rounded_rectangle((540,660,1380,784),24,fill=BLUE)
            center(layer,691,'Get Coursedeck for Chrome',43,WHITE,True)
            center(layer,840,'Free  ·  Open source',31,MUTED)
            center(layer,981,'By CyberWizard',22,MUTED)
    # Brief entrances, continuous small movement, and beat-aligned clean cuts.
    fade=enter if k else 1
    if t>FRAMES/FPS-.25:fade*=max(0,(FRAMES/FPS-t)/.25)
    paste_alpha(base,layer,0,round(12*(1-enter)),fade)
    # Slim progress line never competes with product text.
    ImageDraw.Draw(base).rectangle((0,h-4,round(w*t/(FRAMES/FPS)),h),fill='#789cff')
    return base.convert('RGB')

def store_assets(out):
    out.mkdir(parents=True,exist_ok=True)
    scenes=[('01-assignments','See what’s due.','Assignments and reminders from all your Canvas classes.','dashboard'),
            ('02-less-clutter','Keep old work out of the way.','Search past reminders. Keep the work you still need.','quiet'),
            ('03-week-plans','Find the week’s homework.','Your teachers’ weekly Canvas pages, together.','plans'),
            ('04-calendar','See the days ahead.','Assignments, reminders and school events in one calendar.','calendar'),
            ('05-grades','Check returned work.','Scores and teacher feedback, organized by class.','grades')]
    for slug,head,sub,name in scenes:
        im=stage(1280,800,True).copy()
        text(im,(52,24),'COURSEDECK  /  CANVAS STUDENT PLANNER',15,BLUE,True)
        fit_text(im,(50,55),head,49,1180,INK,True)
        text(im,(53,124),sub,23,'#61718c')
        card=product_layer(name,928)
        # Entire browser frame is visible; the store images contain real UI.
        if card.height>590:
            card=card.resize((round(card.width*590/card.height),590),Image.Resampling.LANCZOS)
        paste_alpha(im,card,(1280-card.width)//2,170)
        text(im,(54,766),'Chrome extension · Fictional demo data',14,'#6b7991')
        text(im,(1117,766),slug[:2]+' / 05',14,'#6b7991')
        im.convert('RGB').save(out/(slug+'.png'))
    im=stage(440,280).copy(); im.alpha_composite(logo(106),(34,40))
    text(im,(162,66),'Coursedeck',34,WHITE,True)
    text(im,(36,170),'Canvas, made simpler.',28,WHITE,True)
    text(im,(38,219),'Your student planner.',20,MUTED)
    im.convert('RGB').save(out/'small-tile-440x280.png')
    im=stage(1400,560).copy(); im.alpha_composite(logo(155),(92,112))
    text(im,(288,95),'Coursedeck',72,WHITE,True)
    text(im,(293,198),'Your Canvas student planner.',35,MUTED)
    text(im,(94,354),'Your classes. One simple view.',57,WHITE,True)
    # Minimal abstract coursework stack reinforces the existing deck mark.
    d=ImageDraw.Draw(im)
    for i in range(3):
        x=1050+i*18;y=104+i*74
        d.rounded_rectangle((x,y,x+245,y+60),12,fill=['#243b67','#2e4778','#3e5b97'][i])
        d.ellipse((x+18,y+23,x+30,y+35),fill=['#94b1ff','#80c9ad','#deb174'][i])
        d.rounded_rectangle((x+48,y+26,x+196,y+32),3,fill='#bac9e4')
    im.convert('RGB').save(out/'marquee-tile-1400x560.png')
    Image.open(ROOT.parent/'icons/128.png').save(out/'store-icon-128.png')

def main():
    p=argparse.ArgumentParser(); p.add_argument('--out',type=Path,required=True);p.add_argument('--stills',action='store_true');p.add_argument('--video',choices=['wide','vertical']);p.add_argument('--audio-source',type=Path)
    a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
    if a.stills:
        store_assets(a.out/'store-assets')
        for portrait in [False,True]:
            thumbs=[]
            for t in [1.8,5.9,9.4,14.5,17.8,21,24,27.5]:
                im=video_frame(t,portrait); im.thumbnail((480,480));thumbs.append(im)
            sheet=Image.new('RGB',(4*480,2*520),'#e5eaf5')
            for i,im in enumerate(thumbs):sheet.paste(im,((i%4)*480+(480-im.width)//2,(i//4)*520))
            sheet.save(a.out/f'storyboard-{ "vertical" if portrait else "wide"}.jpg')
        video_frame(27.5).save(a.out/'youtube-thumbnail.png')
    if a.video:
        if not a.audio_source or not a.audio_source.is_file():raise ValueError('An original video with the approved soundtrack is required')
        portrait=a.video=='vertical'; w,h=(1080,1920) if portrait else (1920,1080)
        target=a.out/f'coursedeck-2.6.0-{w}x{h}.mp4'; ff=imageio_ffmpeg.get_ffmpeg_exe()
        cmd=[ff,'-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-', '-i',str(a.audio_source),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',str(target)]
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        try:
            for i in range(FRAMES):
                process.stdin.write(video_frame(i/FPS,portrait).tobytes())
                if i%300==0: print(f'{a.video}: {i}/{FRAMES} frames',flush=True)
        finally:process.stdin.close()
        if process.wait():raise RuntimeError('Video encoding failed')
        print(target,flush=True)

if __name__=='__main__': main()
