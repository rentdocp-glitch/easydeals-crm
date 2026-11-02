from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import math, os
C=3072
BLUE=(18,116,191);ORG=(255,108,0)
PB='/tmp/f/Poppins-Bold.ttf';PM='/tmp/f/Poppins-Medium.ttf'
def hx(h):h=h.lstrip('#');return tuple(int(h[i:i+2],16) for i in (0,2,4))
im=Image.new('RGBA',(C,C),(0,0,0,0))
def X(v):return v*C
def newmask():return Image.new('L',(C,C),0)
def gfill(mask,top,bot,alpha=255):
    bb=mask.getbbox()
    if not bb:return
    w=bb[2]-bb[0];h=bb[3]-bb[1]
    g=Image.linear_gradient('L').resize((w,h))
    col=ImageOps.colorize(g,hx(top) if isinstance(top,str) else top,hx(bot) if isinstance(bot,str) else bot).convert('RGBA')
    m=mask.crop(bb)
    if alpha<255:m=m.point(lambda v:v*alpha//255)
    im.paste(col,(bb[0],bb[1]),m)
def poly(pts,top,bot,alpha=255):
    m=newmask();ImageDraw.Draw(m).polygon([(X(x),X(y)) for x,y in pts],fill=255);gfill(m,top,bot,alpha)
def rect(x0,y0,x1,y1,top,bot,r=0,alpha=255):
    m=newmask();ImageDraw.Draw(m).rounded_rectangle([X(x0),X(y0),X(x1),X(y1)],radius=X(r),fill=255);gfill(m,top,bot,alpha)
def circ(cx,cy,r,top,bot,alpha=255):
    m=newmask();ImageDraw.Draw(m).ellipse([X(cx-r),X(cy-r),X(cx+r),X(cy+r)],fill=255);gfill(m,top,bot,alpha)
m=newmask();ImageDraw.Draw(m).rounded_rectangle([0,0,C-1,C-1],radius=X(.2),fill=255);gfill(m,'#3D8FEA','#0B3C8C')
m=newmask();b=X(.016);ImageDraw.Draw(m).rounded_rectangle([b,b,C-1-b,C-1-b],radius=X(.185),fill=255);gfill(m,'#FFFFFF','#F3F7FD')
cx,cy,R=.47,.255,.16
for i in range(60,-1,-1):
    t=i/60;r=R*(0.35+0.65*t)
    c=tuple(int(a+(b2-a)*t) for a,b2 in zip(hx('#FFE45C'),hx('#FF8A00')))
    d=ImageDraw.Draw(im);d.ellipse([X(cx-r),X(cy-r),X(cx+r),X(cy+r)],fill=c+(255,))
g=Image.new('RGBA',(C,C),(0,0,0,0));ImageDraw.Draw(g).ellipse([X(cx-R*1.25),X(cy-R*1.25),X(cx+R*1.25),X(cy+R*1.25)],outline=(255,170,40,90),width=int(X(.012)))
im.alpha_composite(g)
def tower(x0,y0,x1,y1,cols,rows,top='#4C9BF0',bot='#1B4FA8'):
    rect(x0,y0,x1,y1,top,bot,r=.004)
    ww=(x1-x0)/(cols*2+1);hh=(y1-y0-.02)/(rows*2)
    for r_ in range(rows):
        for c_ in range(cols):
            rect(x0+ww*(1+2*c_),y0+.012+hh*(2*r_+.6),x0+ww*(2+2*c_),y0+.012+hh*(2*r_+1.5),'#E6F1FF','#A9CCF5',r=.001)
tower(.205,.215,.315,.425,2,5)
tower(.565,.115,.685,.425,2,8)
tower(.685,.20,.795,.425,2,5,'#3F8AE3','#17469A')
rect(.595,.098,.655,.118,'#2E6CC4','#1B4FA8',r=.003)
poly([(.27,.41),(.80,.41),(.93,.505),(.11,.505)],'#8EE06E','#2E9E3E')
d=ImageDraw.Draw(im)
for i in range(1,7):
    x_top=.27+(.80-.27)*i/7;x_bot=.11+(.93-.11)*i/7
    d.line([(X(x_top),X(.41)),(X(x_bot),X(.505))],fill=(255,255,255,170),width=int(X(.003)))
for yv in (.4357,.4693):
    t=(yv-.41)/(.505-.41);xl=.27+(.11-.27)*t;xr=.80+(.93-.80)*t
    d.line([(X(xl),X(yv)),(X(xr),X(yv))],fill=(255,255,255,170),width=int(X(.003)))
poly([(.255,.31),(.475,.17),(.695,.31)],'#2A5FB8','#0B2A66')
poly([(.30,.31),(.475,.215),(.65,.31),(.65,.315),(.30,.315)],'#1D4A98','#0B2A66',0)
rect(.30,.31,.65,.415,'#FFFFFF','#D5E3F5',r=.003)
rect(.215,.355,.30,.415,'#F2F7FD','#C7D9F0',r=.003)
rect(.205,.343,.31,.362,'#1F4F9E','#0B2A66',r=.004)
rect(.325,.33,.44,.395,'#8FC8FF','#2F7DDA',r=.004)
rect(.462,.34,.515,.415,'#1F4F9E','#0B2A66',r=.004)
rect(.545,.335,.625,.395,'#8FC8FF','#2F7DDA',r=.004)
rect(.225,.372,.285,.405,'#8FC8FF','#2F7DDA',r=.003)
poly([(.688,.425),(.752,.425),(.72,.478)],'#E02929','#B01010')
circ(.72,.405,.04,'#FF6A5A','#C41212');circ(.72,.405,.015,'#FFFFFF','#F3F3F3')
def bez(p0,p1,p2,t):return ((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0],(1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1])
p0,p1,p2=(.07,.545),(.50,.62),(.93,.445)
N=80;L=[];Rr=[]
for i in range(N+1):
    t=i/N;x,y=bez(p0,p1,p2,t);x2,y2=bez(p0,p1,p2,min(1,t+.01));x1,y1=bez(p0,p1,p2,max(0,t-.01))
    dx,dy=x2-x1,y2-y1;n=math.hypot(dx,dy);nx,ny=-dy/n,dx/n
    wdt=.022*math.sin(math.pi*t)**0.8+.002
    L.append((x+nx*wdt,y+ny*wdt));Rr.append((x-nx*wdt,y-ny*wdt))
poly(L+Rr[::-1],'#3D9BFF','#0F4DB0')
def fit(s,wfrac,font):
    sz=100
    while ImageFont.truetype(font,sz).getlength(s)<X(wfrac):sz+=4
    return sz
def rtext(xy,s,size,fill,anchor='lm',font=PB,rad=.012):
    f=ImageFont.truetype(font,size);m=newmask();ImageDraw.Draw(m).text(xy,s,font=f,fill=255,anchor=anchor)
    m=m.filter(ImageFilter.GaussianBlur(size*rad)).point(lambda v:255 if v>128 else 0).filter(ImageFilter.GaussianBlur(1.5))
    im.paste(Image.new('RGBA',(C,C),fill+(255,)),(0,0),m)
sz=fit('Easy Deals',.80,PB)
f=ImageFont.truetype(PB,sz);w1=f.getlength('Easy ');w2=f.getlength('Deals');x0=(C-w1-w2)/2;yc=X(.645)
rtext((x0,yc),'Easy',sz,BLUE);rtext((x0+w1,yc),'Deals',sz,ORG)
ef=ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',109)
em=Image.new('RGBA',(136,128),(0,0,0,0));ImageDraw.Draw(em).text((0,0),'🤝'.encode('utf-16','surrogatepass').decode('utf-16'),font=ef,embedded_color=True);em=em.crop(em.getbbox())
ew=int(X(.13));eh=int(ew*em.height/em.width);e=em.resize((ew,eh),Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=3,percent=120))
im.alpha_composite(e,(int((C-ew)/2),int(X(.715))))
cols=[.19,.395,.605,.81];labels=['Leads','Properties','Follow-ups','Reports']
base_im=im;im=Image.new('RGBA',(C,C),(0,0,0,0));d=ImageDraw.Draw(im);bl=BLUE+(255,)
iy=.865
d.ellipse([X(.19-.034),X(iy-.034),X(.19-.006),X(iy-.006)],fill=(90,160,225,255));d.pieslice([X(.19-.052),X(iy-.002),X(.19+.012),X(iy+.06)],180,360,fill=(90,160,225,255))
d.ellipse([X(.19+.002),X(iy-.04),X(.19+.034),X(iy-.008)],fill=bl);d.pieslice([X(.19-.016),X(iy-.004),X(.19+.052),X(iy+.062)],180,360,fill=bl)
xc=.395;d.polygon([(X(xc-.05),X(iy-.002)),(X(xc),X(iy-.047)),(X(xc+.05),X(iy-.002)),(X(xc+.038),X(iy-.002)),(X(xc+.038),X(iy+.05)),(X(xc-.038),X(iy+.05)),(X(xc-.038),X(iy-.002))],fill=bl)
d.rectangle([X(xc-.012),X(iy+.018),X(xc+.012),X(iy+.05)],fill=(255,255,255,255))
xc=.605;d.ellipse([X(xc-.05),X(iy-.048),X(xc+.05),X(iy+.052)],outline=bl,width=int(X(.0085)))
d.line([(X(xc-.024),X(iy+.003)),(X(xc-.006),X(iy+.022)),(X(xc+.03),X(iy-.022))],fill=bl,width=int(X(.0095)),joint='curve')
xc=.81;base=iy+.052
for k,(h,col) in enumerate([(.045,bl),(.075,bl),(.105,(60,185,90,255))]):
    d.rounded_rectangle([X(xc-.05+k*.036),X(base-h),X(xc-.05+k*.036+.026),X(base)],radius=X(.004),fill=col)
d.line([(X(xc-.055),X(base+.004)),(X(xc+.055),X(base+.004))],fill=bl,width=int(X(.004)))
icons=im;im=base_im
for xc in cols:
    bx=(int(X(xc-.085)),int(X(.80)),int(X(xc+.085)),int(X(.935)));cr=icons.crop(bx)
    cr=cr.resize((int(cr.width*.78),int(cr.height*.78)),Image.LANCZOS)
    im.alpha_composite(cr,(int(X(xc)-cr.width/2),int(X(.808))))
for xv in (.2925,.5,.7075):ImageDraw.Draw(im).line([(X(xv),X(.835)),(X(xv),X(.955))],fill=(205,215,230,255),width=int(X(.0025)))
for xc,lab in zip(cols,labels):rtext((X(xc),X(.925)),lab,int(X(.031)),BLUE,anchor='mm',font=PM,rad=.004)
os.makedirs('android/app/src/main/res/drawable-nodpi',exist_ok=True)
out=im.resize((512,512),Image.LANCZOS)
out.save('icon-512.png',optimize=True)
out.save('android/app/src/main/res/drawable-nodpi/app_icon.png',optimize=True)
im.resize((192,192),Image.LANCZOS).save('icon-192.png',optimize=True)
print('done')
