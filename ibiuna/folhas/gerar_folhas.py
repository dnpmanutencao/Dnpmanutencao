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
P = 4.8      # distância entre bolinhas (mm)
R = 1.75     # raio da bolinha (mm)
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
        c.setFillColor(VERDE); c.setFont('SB', 13); c.drawString(32 * mm, (H - 15.5) * mm, 'PEDREIRA IBIÚNA · ' + titulo.upper())
        c.setFillColor(ESC); c.setFont('S', 7.2)
        c.drawString(32 * mm, (H - 20.5) * mm, 'Preencha a bolinha inteira com caneta preta ou azul escura. Não risque fora dela. Em branco = não informado.')
        c.drawString(32 * mm, (H - 24) * mm, 'Para corrigir, risque o número escrito no quadradinho e avise no app: a leitura sempre passa pela sua conferência.')
    def Y(self, y): return (H - y) * mm
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
    f.escolha('turno', 'Turno', [(1, '1º'), (2, '2º'), (3, '3º')], x + 4, y0, horiz=False)
    return x + 18

LAY = {'pagina': [W, H], 'fid': FID, 'fidL': FID_L, 'ori': ORI, 'oriL': ORI_L, 'r': R, 'folhas': {}}

# ---------------- VIAGENS ----------------
c = canvas.Canvas('folha_viagens.pdf', pagesize=A4)
f = Folha(c, 'viagens', 'Folha de viagens')
y0 = 46
data_turno(f, 22, y0)
f.rotulo(92, y0 - 9.5, 'Uma folha por turno. Marque só os caminhões que rodaram.', 7.2, bold=False)
f.rotulo(92, y0 - 5.5, 'Peso médio em branco = usa o peso padrão do app.', 7.2, bold=False)
blocos = []
por_linha = 4; larg = 44.5
for i, fr in enumerate(FROTA[:8]):
    lin, col = divmod(i, por_linha)
    bx = 20 + col * larg; by = 112 + lin * 76
    f.c.setFillColor(colors.HexColor('#e8f1ec')); f.c.roundRect((bx - 3.5) * mm, f.Y(by - 3.2), (larg - 2.5) * mm, 8.6 * mm, 4, stroke=0, fill=1)
    f.rotulo(bx + (larg - 2.5) / 2 - 3.5, by - 6.2, fr, 12, centro=True, cor=VERDE)
    x = f.numero('viagens_' + fr, 'Viagens', bx, by + 8, 2)
    f.numero('peso_' + fr, 'Peso médio (t)', x + 3, by + 8, 2, 1)
    blocos.append(fr)
f.obs(258 if len(FROTA) > 4 else 182, 18 if len(FROTA) > 4 else 50)
f.assinatura(280 - 3 if len(FROTA) > 4 else 248)
f.rodape('Gestão Operacional · no app: Lançar → Viagens → Ler folha preenchida')
c.showPage(); c.save()
LAY['folhas']['viagens'] = {'campos': f.campos, 'frota': blocos}

# ---------------- BRITAGEM ----------------
c = canvas.Canvas('folha_britagem.pdf', pagesize=A4)
f = Folha(c, 'britagem', 'Folha de britagem')
f.escolha('linha', 'Linha', [('primaria', 'Britagem primária'), ('secundaria', 'Britagem secundária'), ('rebritagem', 'Rebritagem')], 22, 38, larg=48)
y0 = 60
x = data_turno(f, 22, y0)
x = f.numero('horasProg', 'Horas prog.', x - 2, y0, 2, 1)
x = f.numero('horIni', 'Horímetro inicial', x + 9, y0, 5, 1)
f.numero('horFim', 'Horímetro final', 22, y0 + 64, 5, 1)
f.numero('prodRb', 'Produção no turno (t) — só secundária e rebritagem', 92, y0 + 64, 5, rotx=92 - R)
yp = 194
f.rotulo(18, yp - 17, 'PARADAS OPERACIONAIS (horas)', 8.5, cor=VERDE)
f.rotulo(80, yp - 17, 'Manutenção não entra aqui: é lançada na OS.', 7, bold=False)
largp = 22
for i, cat in enumerate(PARADAS[:8]):
    bx = 21 + i * largp
    # nome da parada em até 2 linhas
    pal = cat.split(' '); l1 = ''; l2 = ''
    for p in pal:
        if len((l1 + ' ' + p).strip()) <= 11 and not l2: l1 = (l1 + ' ' + p).strip()
        else: l2 = (l2 + ' ' + p).strip()
    f.rotulo(bx + 2, yp - 12, l1, 6.4, centro=True); f.rotulo(bx + 2, yp - 9.2, l2, 6.4, centro=True)
    f.numero('par_' + str(i), '', bx, yp, 1, 1)
LAY['folhas']['britagem'] = {'campos': f.campos, 'paradas': PARADAS[:8]}
f.obs(250, 20)
f.assinatura(276)
f.rodape('Gestão Operacional · no app: Lançar → Britagem → Ler folha preenchida')
c.showPage(); c.save()

open('../omr-layout.js', 'w').write('// gerado por folhas/gerar_folhas.py — não editar à mão\nwindow.OMR_LAYOUT=' + json.dumps(LAY, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ok', len(LAY['folhas']['viagens']['campos']), len(LAY['folhas']['britagem']['campos']))
