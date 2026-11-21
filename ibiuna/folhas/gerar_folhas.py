# Gera as folhas de marcação (PDF) e o mapa das bolinhas usado pelo app (omr-layout.js).
# Coordenadas em mm a partir do canto superior esquerdo da folha A4 (210 x 297).
# Rodar de novo sempre que mudar a frota ou as categorias de parada.
import json, sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('S', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('SB', F + 'DejaVuSans-Bold.ttf'))

FROTA = ['CB01', 'CB02', 'CB03', 'CB04']
PARADAS = ['Gaiola / engaiolamento', 'Pulmão cheio', 'Falta de energia', 'Falta máq./caminhão',
           'Pesagem caminhão', 'Início / fim de turno', 'Arrumando frente', 'DDS']
if len(sys.argv) > 1:
    cfg = json.load(open(sys.argv[1]))
    FROTA = cfg.get('frota', FROTA); PARADAS = cfg.get('paradasOp', PARADAS)

W, H = 210, 297
P = 5.0      # distância entre bolinhas (mm)
R = 1.9      # raio da bolinha (mm)
FID = [(14, 14), (196, 14), (196, 283), (14, 283)]   # centros dos quadrados (sentido horário a partir do sup. esq.)
FID_L = 7.0  # lado do quadrado
ORI = (25, 14)  # quadradinho de orientação, só ao lado do canto superior esquerdo
ORI_L = 3.5
VERDE = colors.HexColor('#0f4f2b'); CINZA = colors.HexColor('#9aa39e'); ESC = colors.HexColor('#14211a')

class Folha:
    def __init__(self, c, tipo, titulo):
        self.c = c; self.campos = []; self.tipo = tipo
        c.setTitle(titulo)
        for (x, y) in FID: self.quad(x, y, FID_L)
        self.quad(ORI[0], ORI[1], ORI_L)
        c.setFillColor(VERDE); c.setFont('SB', 14); c.drawString(32 * mm, (H - 16) * mm, 'PEDREIRA IBIÚNA · ' + titulo.upper())
        c.setFillColor(ESC); c.setFont('S', 7.6); c.drawString(32 * mm, (H - 21) * mm, 'Folha para lançar pelo celular: preencha, tire a foto no app e confira antes de salvar.')
        self.instrucoes()
    def Y(self, y): return (H - y) * mm
    def instrucoes(self):
        c = self.c; y0 = 26; c.setFillColor(colors.HexColor('#eef5f0')); c.setStrokeColor(colors.HexColor('#9cc7ad'))
        c.roundRect(18 * mm, self.Y(y0 + 22), 174 * mm, 22 * mm, 6, stroke=1, fill=1)
        passos = [('1', 'Escreva o número', 'nos quadradinhos.'), ('2', 'Pinte a bolinha', 'do mesmo número.'), ('3', 'Tire a foto no app', 'Lançar → Ler folha.')]
        for i, (n, a1, a2) in enumerate(passos):
            x = 22 + i * 39
            c.setFillColor(VERDE); c.circle((x + 3) * mm, self.Y(y0 + 7), 3 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white); c.setFont('SB', 10); c.drawCentredString((x + 3) * mm, self.Y(y0 + 8.3), n)
            c.setFillColor(ESC); c.setFont('SB', 7.6); c.drawString((x + 7.5) * mm, self.Y(y0 + 6.2), a1)
            c.setFont('S', 7.2); c.drawString((x + 7.5) * mm, self.Y(y0 + 9.6), a2)
        c.setFont('S', 7); c.setFillColor(ESC)
        c.drawString(22 * mm, self.Y(y0 + 15.5), 'Caneta preta ou azul escura. Em branco = não informado. Errou? Avise no app ao conferir.')
        c.drawString(22 * mm, self.Y(y0 + 19.2), 'Número de 1 dígito: pode pintar só a última coluna (ex.: 7 viagens = só o 7).')
        # exemplo: 34
        ex = 143; c.setFont('SB', 7.4); c.drawString(ex * mm, self.Y(y0 + 4.5), 'Exemplo: 34')
        for j, d in enumerate(['3', '4']):
            x = ex + 3 + j * 6; self.caixinha(x, y0 + 8.6); c.setFont('SB', 8); c.setFillColor(colors.HexColor('#1f3fa0')); c.drawCentredString(x * mm, self.Y(y0 + 10), d)
            c.setFillColor(colors.HexColor('#1f3fa0')); c.circle(x * mm, self.Y(y0 + 15.8), 1.9 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white); c.setFont('SB', 6); c.drawCentredString(x * mm, self.Y(y0 + 16.6), d)
        c.setFillColor(ESC); c.setFont('S', 6.6); c.drawString((ex + 17) * mm, self.Y(y0 + 9), 'Certo:')
        c.setFillColor(colors.HexColor('#1f3fa0')); c.circle((ex + 31) * mm, self.Y(y0 + 8.3), 1.6 * mm, stroke=0, fill=1)
        c.setFillColor(ESC); c.drawString((ex + 17) * mm, self.Y(y0 + 15.5), 'Errado:')
        c.setStrokeColor(colors.HexColor('#6f7a74')); c.setLineWidth(0.5)
        for k, m in enumerate(['✓', '✗', '·']):
            xx = ex + 27 + k * 4.5; c.circle(xx * mm, self.Y(y0 + 14.8), 1.6 * mm, stroke=1, fill=0)
            c.setFillColor(colors.HexColor('#1f3fa0')); c.setFont('SB', 7); c.drawCentredString(xx * mm, self.Y(y0 + 15.8), m); c.setFillColor(ESC)
    def passo(self, n, txt, y, extra=''):
        c = self.c; c.setFillColor(VERDE); c.circle(21 * mm, self.Y(y), 2.8 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont('SB', 9); c.drawCentredString(21 * mm, self.Y(y + 1.2), str(n))
        c.setFillColor(VERDE); c.setFont('SB', 9.5); c.drawString(26 * mm, self.Y(y + 1.3), txt)
        if extra: c.setFillColor(colors.HexColor('#5b6a61')); c.setFont('S', 7.2); c.drawString(26 * mm + pdfmetrics.stringWidth(txt, 'SB', 9.5) + 6, self.Y(y + 1.2), extra)
    def quad(self, x, y, l):
        self.c.setFillColor(colors.black); self.c.rect((x - l / 2) * mm, self.Y(y + l / 2), l * mm, l * mm, stroke=0, fill=1)
    def bolinha(self, x, y, txt):
        c = self.c; c.setStrokeColor(colors.HexColor('#6f7a74')); c.setLineWidth(0.5); c.setFillColor(colors.white)
        c.circle(x * mm, self.Y(y), R * mm, stroke=1, fill=1)
        c.setFillColor(CINZA); c.setFont('S', 5.2); c.drawCentredString(x * mm, self.Y(y) - 1.9, txt)
    def rotulo(self, x, y, txt, tam=8, bold=True, cor=ESC, centro=False):
        self.c.setFillColor(cor); self.c.setFont('SB' if bold else 'S', tam)
        (self.c.drawCentredString if centro else self.c.drawString)(x * mm, self.Y(y), txt)
    def caixinha(self, x, y):  # quadradinho para escrever o número à mão (ajuda a conferir)
        self.c.setStrokeColor(colors.HexColor('#6f7a74')); self.c.setLineWidth(0.5); self.c.rect((x - 2.1) * mm, self.Y(y + 2.6), 4.2 * mm, 5.2 * mm, stroke=1, fill=0)
    def numero(self, nome, rot, x0, y0, inteiros, decimais=0, digitos=None, rotx=None):
        """Colunas de 0 a 9, uma por dígito. digitos: lista de conjuntos permitidos por coluna."""
        cols = []; x = x0
        self.rotulo(rotx if rotx is not None else x0 - R, y0 - 9.5, rot, 7.4)
        for i in range(inteiros + decimais):
            if i == inteiros:
                self.rotulo(x - 1.2, y0 + 9 * P + 2, ',', 11, centro=True); x += 2.4
            ds = digitos[i] if digitos else range(10)
            self.caixinha(x, y0 - 5)
            bs = []
            for d in ds:
                yy = y0 + d * P; self.bolinha(x, yy, str(d)); bs.append({'v': d, 'x': round(x, 2), 'y': round(yy, 2)})
            cols.append(bs); x += P + 0.4
        self.campos.append({'nome': nome, 'tipo': 'num', 'int': inteiros, 'dec': decimais, 'cols': cols})
        return x
    def escolha(self, nome, rot, opcoes, x0, y0, horiz=True, larg=None):
        self.rotulo(x0 - R, y0 - 5, rot, 7.4)
        ops = []; x, y = x0, y0
        for v, txt in opcoes:
            self.bolinha(x, y, ''); self.rotulo(x + 3, y + 1.1, txt, 7.6, bold=False)
            ops.append({'v': v, 'x': round(x, 2), 'y': round(y, 2)})
            if horiz: x += larg or (6 + len(txt) * 1.75)
            else: y += P + 0.6
        self.campos.append({'nome': nome, 'tipo': 'escolha', 'ops': ops})
    def obs(self, y, h):
        self.rotulo(18, y - 1.5, 'Observações (não são lidas — vá no app se precisar registrar):', 7.2, bold=False)
        self.c.setStrokeColor(colors.HexColor('#b5bdb8')); self.c.rect(18 * mm, self.Y(y + h), 174 * mm, h * mm, stroke=1, fill=0)
    def rodape(self, txt):
        self.rotulo(105, 289.5, txt, 6.6, bold=False, cor=colors.HexColor('#5b6a61'), centro=True)
    def assinatura(self, y):
        self.rotulo(18, y, 'Operador: ______________________________     Matrícula: __________     Visto do supervisor: ______________________', 7.6, bold=False)

def data_turno(f, x0, y0):
    x = f.numero('dia', 'Dia', x0, y0, 2, digitos=[range(4), range(10)])
    x = f.numero('mes', 'Mês', x + 2, y0, 2, digitos=[range(2), range(10)])
    f.escolha('turno', 'Turno', [(1, '1º turno'), (2, '2º turno'), (3, '3º turno')], x + 4, y0, horiz=False)
    return x + 26

LAY = {'pagina': [W, H], 'fid': FID, 'fidL': FID_L, 'ori': ORI, 'oriL': ORI_L, 'r': R, 'folhas': {}}

# ---------------- VIAGENS ----------------
c = canvas.Canvas('folha_viagens.pdf', pagesize=A4)
f = Folha(c, 'viagens', 'Folha de viagens')
f.passo(1, 'DIA E TURNO', 58)
data_turno(f, 24, 78)
f.passo(2, 'CAMINHÕES', 132, '— marque só os que rodaram neste turno')
blocos = []; por_linha = 4; larg = 44.5
for i, fr in enumerate(FROTA[:8]):
    lin, col = divmod(i, por_linha)
    bx = 21 + col * larg; by = 146 + lin * 78
    f.c.setFillColor(colors.HexColor('#e8f1ec')); f.c.roundRect((bx - 3.5) * mm, f.Y(by + 1), (larg - 2.5) * mm, 8.6 * mm, 4, stroke=0, fill=1)
    f.rotulo(bx + (larg - 2.5) / 2 - 3.5, by - 2, fr, 12, centro=True, cor=VERDE)
    x = f.numero('viagens_' + fr, 'Viagens', bx, by + 17, 2)
    f.numero('peso_' + fr, 'Peso (t) opcional', x + 3, by + 17, 2, 1)
    blocos.append(fr)
yo = 146 + 78 * ((len(blocos) - 1) // por_linha) + 17 + 9 * P + 12
if yo + 22 < 268:
    f.obs(yo, 268 - yo - 6)
f.assinatura(276)
f.rodape('Peso em branco = peso padrão do app · Gestão Operacional')
c.showPage(); c.save()
LAY['folhas']['viagens'] = {'campos': f.campos, 'frota': blocos}

# ---------------- BRITAGEM ----------------
c = canvas.Canvas('folha_britagem.pdf', pagesize=A4)
f = Folha(c, 'britagem', 'Folha de britagem')
f.passo(1, 'LINHA', 55)
f.escolha('linha', '', [('primaria', 'Britagem primária'), ('secundaria', 'Britagem secundária'), ('rebritagem', 'Rebritagem')], 48, 55, larg=48)
f.passo(2, 'DIA, TURNO E HORAS', 64)
x = data_turno(f, 24, 80)
f.numero('horasProg', 'Horas programadas', x + 2, 80, 2, 1)
f.rotulo(x + 1, 130, '(só se for diferente do normal)', 6.4, bold=False)
f.passo(3, 'HORÍMETRO DO BRITADOR E PRODUÇÃO', 136)
f.numero('horIni', 'Horímetro no INÍCIO', 24, 152, 5, 1)
f.numero('horFim', 'Horímetro no FIM', 72, 152, 5, 1)
f.numero('prodRb', 'Produção (t) — só secundária/rebritagem', 124, 152, 5, rotx=124 - R)
yp = 219
f.passo(4, 'PARADAS OPERACIONAIS EM HORAS', 205, '— 0,5 = meia hora · manutenção vai na OS')
largp = 22
for i, cat in enumerate(PARADAS[:8]):
    bx = 22 + i * largp
    pal = cat.split(' '); l1 = ''; l2 = ''
    for p in pal:
        if len((l1 + ' ' + p).strip()) <= 11 and not l2: l1 = (l1 + ' ' + p).strip()
        else: l2 = (l2 + ' ' + p).strip()
    f.rotulo(bx + 2.5, yp - 7.2, l1, 6.4, centro=True); f.rotulo(bx + 2.5, yp - 4.6, l2, 6.4, centro=True)
    f.numero('par_' + str(i), '', bx, yp + 6, 1, 1)
LAY['folhas']['britagem'] = {'campos': f.campos, 'paradas': PARADAS[:8]}
f.rodape('Observações e manutenção: lance no app · Gestão Operacional')
c.showPage(); c.save()

open('../omr-layout.js', 'w').write('// gerado por folhas/gerar_folhas.py — não editar à mão\nwindow.OMR_LAYOUT=' + json.dumps(LAY, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ok', len(LAY['folhas']['viagens']['campos']), len(LAY['folhas']['britagem']['campos']))
