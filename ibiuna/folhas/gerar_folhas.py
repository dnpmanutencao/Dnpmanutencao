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
    def __init__(self, c, tipo, titulo, passos=None, linhas=None, exemplo=True):
        self.passos = passos; self.linhas = linhas; self.exemplo = exemplo
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
        passos = self.passos or [('1', 'Escreva o número', 'nos quadradinhos.'), ('2', 'Pinte a bolinha', 'do mesmo número.'), ('3', 'Tire a foto no app', 'Lançar → Ler folha.')]
        for i, (n, a1, a2) in enumerate(passos):
            x = 22 + i * 39
            c.setFillColor(VERDE); c.circle((x + 3) * mm, self.Y(y0 + 7), 3 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white); c.setFont('SB', 10); c.drawCentredString((x + 3) * mm, self.Y(y0 + 8.3), n)
            c.setFillColor(ESC); c.setFont('SB', 7.6); c.drawString((x + 7.5) * mm, self.Y(y0 + 6.2), a1)
            c.setFont('S', 7.2); c.drawString((x + 7.5) * mm, self.Y(y0 + 9.6), a2)
        c.setFont('S', 7); c.setFillColor(ESC)
        ls = self.linhas or ['Caneta preta ou azul escura. Em branco = não informado.', 'Errou? Corrija no app na hora de conferir.']
        c.drawString(22 * mm, self.Y(y0 + 15.5), ls[0]); c.drawString(22 * mm, self.Y(y0 + 19.2), ls[1])
        ex = 143; c.setFont('SB', 7.4); c.drawString(ex * mm, self.Y(y0 + 4.5), 'Exemplo: 34' if self.exemplo else 'Como pintar:')
        for j, d in enumerate(['3', '4'] if self.exemplo else []):
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
    def numeroH(self, nome, x0, y0, linhas, gap=8.5):
        """Uma linha de bolinhas 0..9 por algarismo (ex.: dezena e unidade)."""
        cols = []
        for k, rot in enumerate(linhas):
            y = y0 + k * gap; self.rotulo(x0, y + 1.2, rot, 8, bold=False)
            bs = []
            for d in range(10):
                x = x0 + 20 + d * (P + 1.2); self.bolinha(x, y, str(d)); bs.append({'v': d, 'x': round(x, 2), 'y': round(y, 2)})
            cols.append(bs)
        self.campos.append({'nome': nome, 'tipo': 'num', 'int': len(linhas), 'dec': 0, 'cols': cols})
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
f = Folha(c, 'viagens', 'Folha de viagens', passos=[('1', 'Marque o turno.', ''), ('2', 'Pinte as viagens', 'de cada caminhão.'), ('3', 'Tire a foto no app', 'Lançar → Viagens.')],
          linhas=['Caneta preta ou azul escura. Caminhão que não rodou: deixe em branco.', 'Errou? Corrija no app na hora de conferir.'], exemplo=False)
f.passo(1, 'DATA E TURNO', 58)
f.rotulo(24, 69, 'Data:  ____ / ____', 10, bold=False)
f.escolha('turno', '', [(1, '1º turno'), (2, '2º turno'), (3, '3º turno')], 80, 68, larg=30)
f.passo(2, 'QUANTAS VIAGENS CADA CAMINHÃO FEZ?', 82)
f.rotulo(24, 89, '34 viagens → pinte o 3 em cima e o 4 embaixo.   7 viagens → pinte só o 7 embaixo.', 8.2, bold=False)
blocos = []
for i, fr in enumerate(FROTA[:8]):
    by = 98 + i * 27
    f.c.setStrokeColor(colors.HexColor('#9cc7ad')); f.c.setFillColor(colors.HexColor('#f4f9f6')); f.c.roundRect(20 * mm, f.Y(by + 21), 172 * mm, 23 * mm, 6, stroke=1, fill=1)
    f.rotulo(24, by + 11, fr, 15, cor=VERDE)
    f.rotulo(24, by + 16.5, 'viagens: ______', 7.6, bold=False)
    f.numeroH('viagens_' + fr, 62, by + 6, ['dezena', 'unidade'])
    blocos.append(fr)
f.assinatura(98 + len(blocos) * 27 + 6)
f.rodape('O peso de cada viagem é o padrão do app · Gestão Operacional')
c.showPage(); c.save()
LAY['folhas']['viagens'] = {'campos': f.campos, 'frota': blocos}

# ---------------- BRITAGEM ----------------
c = canvas.Canvas('folha_britagem.pdf', pagesize=A4)
f = Folha(c, 'britagem', 'Folha de britagem', passos=[('1', 'Marque britagem', 'e turno.'), ('2', 'Horímetro: escreva', 'e pinte embaixo.'), ('3', 'Paradas: uma', 'bolinha por motivo.')],
          linhas=['Caneta preta ou azul escura. Depois tire a foto no app: Lançar → Britagem.', 'Errou? Corrija no app na hora de conferir.'])
f.passo(1, 'QUAL BRITAGEM?', 56)
f.escolha('linha', '', [('primaria', 'Primária'), ('secundaria', 'Secundária'), ('rebritagem', 'Rebritagem')], 80, 55.5, larg=34)
f.passo(2, 'DATA E TURNO', 65)
f.rotulo(26, 72.5, 'Data:  ____ / ____', 10, bold=False)
f.escolha('turno', '', [(1, '1º turno'), (2, '2º turno'), (3, '3º turno')], 80, 71.5, larg=30)
f.passo(3, 'HORÍMETRO DO BRITADOR', 82, '— escreva nos quadradinhos e pinte embaixo')
f.numero('horIni', 'No INÍCIO do turno', 30, 104, 5, 1)
f.numero('horFim', 'No FIM do turno', 104, 104, 5, 1)
f.passo(4, 'PAROU? QUANTO TEMPO?', 166, '— pinte uma bolinha por motivo · não parou = em branco')
TEMPOS = [(0.5, '½ h'), (1, '1 h'), (1.5, '1½ h'), (2, '2 h'), (3, '3 h'), (4, '4 h'), (6, '6 h'), (8, '8 h')]
for i, cat in enumerate(PARADAS[:8]):
    y = 177 + i * 11.5
    if i % 2 == 0:
        f.c.setFillColor(colors.HexColor('#f4f9f6')); f.c.rect(20 * mm, f.Y(y + 4.6), 172 * mm, 9.2 * mm, stroke=0, fill=1)
    f.rotulo(24, y + 1.3, cat, 8.6)
    f.escolha('par_' + str(i), '', TEMPOS, 76, y, larg=15.6)
LAY['folhas']['britagem'] = {'campos': f.campos, 'paradas': PARADAS[:8]}
f.assinatura(276)
f.rodape('Produção, observações e manutenção: lance no app · Gestão Operacional')
c.showPage(); c.save()

open('../omr-layout.js', 'w').write('// gerado por folhas/gerar_folhas.py — não editar à mão\nwindow.OMR_LAYOUT=' + json.dumps(LAY, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ok', len(LAY['folhas']['viagens']['campos']), len(LAY['folhas']['britagem']['campos']))
