#!/usr/bin/env python3
"""Formato de licencia de software y tratamiento de datos. Borrador para revisión de abogado."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem, CondPageBreak,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont("Serif", "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Serif-B", "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Serif-I", "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"))
pdfmetrics.registerFont(TTFont("Serif-BI", "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("Sans", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Sans-B", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"))

INK = HexColor("#1a1a1a")
RULE = HexColor("#222222")
MUTED = HexColor("#444444")
LINE = HexColor("#cccccc")
PAPER = HexColor("#f4f1ea")

OUT_CONTRATO = "/workspace/artifacts/Contrato-licencia-software-y-datos.pdf"
OUT_CARTA = "/workspace/artifacts/Carta-para-la-empresa.pdf"


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(
        name="CoverKicker", fontName="Sans", fontSize=8, leading=11,
        textColor=MUTED, alignment=TA_CENTER, tracking=1.2, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="DocTitle", fontName="Serif-B", fontSize=15, leading=19,
        textColor=INK, alignment=TA_CENTER, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="DocSub", fontName="Serif-I", fontSize=10, leading=13,
        textColor=MUTED, alignment=TA_CENTER, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        name="H", fontName="Serif-B", fontSize=11, leading=14,
        textColor=INK, spaceBefore=11, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="B", fontName="Serif", fontSize=10, leading=13.4,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        name="Bleft", fontName="Serif", fontSize=10, leading=13.4,
        textColor=INK, alignment=TA_LEFT, spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        name="Btight", fontName="Serif", fontSize=10, leading=13.2,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=3,
    ))
    ss.add(ParagraphStyle(
        name="Label", fontName="Sans-B", fontSize=8, leading=10,
        textColor=MUTED, spaceBefore=6, spaceAfter=1,
    ))
    ss.add(ParagraphStyle(
        name="Field", fontName="Serif", fontSize=10, leading=13,
        textColor=INK, spaceAfter=1,
    ))
    ss.add(ParagraphStyle(
        name="Small", fontName="Serif-I", fontSize=8.5, leading=11,
        textColor=MUTED, alignment=TA_LEFT, spaceBefore=2, spaceAfter=4,
    ))
    ss.add(ParagraphStyle(
        name="CenterSmall", fontName="Serif", fontSize=8.5, leading=11,
        textColor=MUTED, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        name="SignName", fontName="Serif-B", fontSize=10, leading=13,
        textColor=INK, alignment=TA_CENTER, spaceBefore=2,
    ))
    ss.add(ParagraphStyle(
        name="SignRole", fontName="Serif", fontSize=9, leading=12,
        textColor=INK, alignment=TA_LEFT,
    ))
    ss.add(ParagraphStyle(
        name="Letter", fontName="Serif", fontSize=11, leading=16,
        textColor=INK, alignment=TA_JUSTIFY, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        name="LetterHead", fontName="Serif-B", fontSize=12, leading=15,
        textColor=INK, alignment=TA_LEFT, spaceAfter=2,
    ))
    return ss


S = styles()


def p(text, style="B"):
    return Paragraph(text, S[style])


def footer_contrato(canvas, doc):
    canvas.saveState()
    w, h = letter
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, 1.45 * cm, w - 2 * cm, 1.45 * cm)
    canvas.setFont("Sans", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, 0.95 * cm, "Licencia de software y tratamiento de datos  ·  iniciales: licenciante ______   empresa ______")
    canvas.drawRightString(w - 2 * cm, 0.95 * cm, f"{doc.page}")
    canvas.restoreState()


def footer_carta(canvas, doc):
    canvas.saveState()
    w, h = letter
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(2.2 * cm, 1.5 * cm, w - 2.2 * cm, 1.5 * cm)
    canvas.setFont("Sans", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2.2 * cm, 1.0 * cm, "Carta de envío. No reemplaza el contrato.")
    canvas.restoreState()


def build_contrato():
    doc = SimpleDocTemplate(
        OUT_CONTRATO, pagesize=letter,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.6 * cm, bottomMargin=1.8 * cm,
        title="Contrato de licencia de software y tratamiento de datos",
        author="David Santiago Jaimes Peña",
    )
    story = []

    story.append(p("PARA FIRMA DE LAS DOS PARTES", "CoverKicker"))
    story.append(p("CONTRATO DE LICENCIA DE USO DE SOFTWARE,<br/>PACTO SOBRE DERECHOS DE AUTOR<br/>Y ENCARGO DE TRATAMIENTO DE DATOS PERSONALES", "DocTitle"))
    story.append(HRFlowable(width="100%", thickness=1, color=RULE, spaceAfter=8))
    story.append(p(
        "Este documento solo obliga cuando lo firman el autor del programa y el representante legal de la empresa, o un apoderado con poder. Una copia se queda en cada parte.",
        "DocSub",
    ))

    story.append(p("CIUDAD Y FECHA", "Label"))
    story.append(p("Bogotá D.C., a los __________ (__________) días del mes de ________________________ de 2026.", "Bleft"))

    story.append(p("1.  QUIÉNES FIRMAN", "H"))
    story.append(p("<b>Licenciante (autor del programa).</b> David Santiago Jaimes Peña, mayor de edad, identificado con cédula de ciudadanía No. 1.065.864.538, domiciliado en Bogotá D.C.", "Btight"))
    story.append(p("Correo: _______________________________________________ &nbsp;&nbsp; Teléfono: ______________________________.", "Bleft"))
    story.append(p("En adelante, el Licenciante."))
    story.append(p("<b>Licenciatario (la empresa).</b> La sociedad que figura como empleador en el contrato de trabajo, no solo el nombre comercial.", "Btight"))
    story.append(p("Razón social: _________________________________________________________________________", "Bleft"))
    story.append(p("NIT: ________________________________", "Bleft"))
    story.append(p("Representante legal: ________________________________________________________________", "Bleft"))
    story.append(p("C.C. No. ______________________________", "Bleft"))
    story.append(p("Cargo del representante: ________________________________. En adelante, el Licenciatario o la Empresa.", "Bleft"))
    story.append(p("Cargo en el que el Licenciante presta sus servicios, tal como figura en el contrato de trabajo:", "Btight"))
    story.append(p("________________________________________________________________.", "Bleft"))
    story.append(p("Nombre con el que se conoce la operación, si es distinto de la razón social:", "Btight"))
    story.append(p("_________________________________________________________________________.", "Bleft"))
    story.append(p("Las dos partes declaran que pueden obligarse. Quien firma por la Empresa declara que es representante legal o que tiene poder escrito para obligarla en propiedad intelectual y en datos personales.", "Btight"))

    story.append(p("2.  ANTECEDENTES", "H"))
    story.append(p("El Licenciante declara, y la Empresa al firmar acepta regular el uso del programa sobre esta base:"))
    story.append(p("<b>a)</b> El Licenciante ideó y desarrolló por su propia iniciativa el programa de computador descrito en la cláusula 3 (el «Software»).", "Btight"))
    story.append(p("<b>b)</b> No hubo un encargo escrito para crearlo, ni un pago distinto del salario destinado a comprar el programa o a encargar su desarrollo.", "Btight"))
    story.append(p("<b>c)</b> El desarrollo se hizo principalmente con equipos, cuentas, dominios y herramientas del Licenciante. La Empresa no le compró licencias ni le asignó un equipo con el fin de construir este Software.", "Btight"))
    story.append(p("<b>d)</b> El Licenciante ofrece el Software a la Empresa como una herramienta externa para facilitar procesos de vinculación, gestión y control. Ofrecerlo no significa que el programa pase a ser de la Empresa.", "Btight"))
    story.append(p("<b>e)</b> Las marcas, los logos, los modelos de contrato y las bases con datos de personas son de la Empresa o de sus titulares. No hacen parte de la propiedad del Licenciante sobre el Software.", "Btight"))
    story.append(p("Las partes quieren dejar esto por escrito como pacto en contrario del artículo 20 de la Ley 23 de 1982, modificado por el artículo 28 de la Ley 1450 de 2011, y regular al mismo tiempo la licencia de uso y el tratamiento de datos personales."))

    story.append(p("3.  EL PROGRAMA", "H"))
    story.append(p("El Software es la plataforma de gestión de vinculaciones y de la operación de asesores creada por el Licenciante, incluida la forma en que organiza llamadas, placas, tipificaciones, control de jornada, bitácora, documentos, estadísticas y generación de soportes."))
    story.append(p("Nombre con el que se identifica, si ya tiene uno:", "Btight"))
    story.append(p("_________________________________________________________________________.", "Bleft"))
    story.append(p("Dirección web o repositorio, si aplica:", "Btight"))
    story.append(p("_________________________________________________________________________.", "Bleft"))
    story.append(p("Hacen parte del Software el código, la estructura, las pantallas, los flujos y la documentación técnica escritos por el Licenciante. <b>No hacen parte del Software</b>, y siguen siendo de la Empresa o de sus respectivos dueños: las bases de placas y de clientes, los datos personales, las fotos de documentos, los logos, los nombres comerciales y el texto de los contratos o minutas de la Empresa."))

    story.append(p("4.  DE QUIÉN ES EL PROGRAMA", "H"))
    story.append(p("<b>4.1.</b> El Licenciante es el autor del Software y conserva los derechos morales. También conserva los derechos patrimoniales: reproducirlo, adaptarlo, licenciarlo y comercializarlo."))
    story.append(p("<b>4.2. Pacto en contrario.</b> Las partes pactan, de forma expresa y como pacto en contrario del artículo 20 de la Ley 23 de 1982, que los derechos patrimoniales sobre el Software <b>no se trasladan</b> a la Empresa por el contrato de trabajo ni por el hecho de que la Empresa lo use. La Empresa no adquiere la propiedad del código, de las cuentas ni de los repositorios del Licenciante."))
    story.append(p("<b>4.3. Cesión de regreso, por si hiciera falta.</b> Si alguna autoridad entendiera que un derecho patrimonial ya había pasado a la Empresa por esa presunción legal, la Empresa, al firmar, lo cede de vuelta al Licenciante. La cesión cubre todos los derechos patrimoniales sobre el código, las interfaces y la documentación técnica del Software. Es para todo el mundo, por todo el tiempo de protección legal del derecho de autor, y no queda recortada al plazo de cinco años ni al territorio de los que habla el artículo 183 de la Ley 23 de 1982. La causa de esta cesión es el conjunto de este contrato, en especial la licencia que recibe la Empresa. Esta cesión <b>no incluye</b> datos personales, bases, marcas, logos ni minutas de la Empresa."))
    story.append(p("<b>4.4.</b> Las mejoras que el Licenciante haga después también son suyas, salvo que las partes firmen un encargo distinto, por escrito, que diga otra cosa y pague ese encargo aparte."))
    story.append(p("<b>4.5.</b> El Licenciante puede licenciar el Software genérico a otras personas o empresas. En ese caso no puede llevarse datos, bases, marcas, logos, minutas ni documentos de esta Empresa."))

    story.append(p("5.  PERMISO DE USO QUE DA EL LICENCIANTE", "H"))
    story.append(p("<b>5.1.</b> El Licenciante concede a la Empresa una licencia de uso del Software con estas condiciones, que se escriben para cumplir el artículo 183 de la Ley 23 de 1982: no exclusiva, intransferible, sin derecho a sublicenciar, solo en la República de Colombia, y solo durante la vigencia de este contrato."))
    story.append(p("<b>5.2.</b> La Empresa puede usar el Software únicamente para su propia operación de vinculaciones, afiliaciones, contacto y control interno. Puede autorizar el ingreso a sus trabajadores y contratistas, con usuario propio. Esos usuarios no adquieren ningún derecho sobre el programa."))
    story.append(p("<b>5.3.</b> La Empresa no recibe el código fuente, no puede copiar el programa para revenderlo, no puede entregarlo a otra empresa del grupo o a un proveedor, y no puede quitar la constancia de autoría que el Licenciante deje en el Software."))
    story.append(p("<b>5.4.</b> Este permiso es el que autoriza a la Empresa, y a las personas que ella habilite, a usar la herramienta en el trabajo. No convierte al Licenciante en obligado a inventar funciones nuevas."))

    story.append(p("6.  PRECIO DE LA LICENCIA", "H"))
    story.append(p("<b>Opción A. Uso sin cobro mientras dure el trabajo.</b> Mientras esté vigente el contrato de trabajo entre las partes, la licencia no tiene canon adicional. Eso no cambia el salario, no paga el desarrollo y no vuelve el Software una obra por encargo."))
    story.append(p("<b>Opción B. Cobro desde ahora.</b> Solo aplica si las dos partes llenan esta frase y ponen sus iniciales al margen. Si queda en blanco, se tiene por no escrita y rige la Opción A.", "Btight"))
    story.append(p("Canon mensual de $ _________________________ más IVA, desde el día _________________________.", "Bleft"))
    story.append(p("Iniciales: licenciante __________ &nbsp;&nbsp;&nbsp; empresa __________.", "Bleft"))
    story.append(p("<b>6.1. Si se acaba el contrato de trabajo.</b> El uso no sigue gratis. Si la Empresa quiere seguir usando el Software, las partes tendrán treinta (30) días calendario para firmar una licencia de pago. Si esos treinta días pasan sin contrato nuevo, la licencia termina y se aplica la cláusula 12."))
    story.append(p("<b>6.2.</b> El precio de una licencia posterior, o de una venta del Software a un tercero, no se fija en este documento. Se acuerda aparte. Este contrato no obliga al Licenciante a vender, ni obliga a la Empresa a comprar."))

    story.append(p("7.  LOGOS, NOMBRES Y CONTRATOS DE LA EMPRESA", "H"))
    story.append(p("<b>7.1.</b> Los logos, nombres, lemas, colores institucionales, manuales y el texto de los contratos, formatos y minutas de la Empresa son de la Empresa. El Licenciante no se vuelve dueño de eso por alojarlo o mostrarlo en el Software."))
    story.append(p("<b>7.2.</b> La Empresa autoriza al Licenciante, solo mientras esta licencia esté vigente y solo dentro de la cuenta de la Empresa, a cargar y mostrar esos signos y esos textos para que la herramienta le sirva a ella. Esta autorización no es una cesión de marca. No permite usar el logo ni el contrato de la Empresa en publicidad, en propuestas a otros clientes ni en otro despliegue."))
    story.append(p("<b>7.3.</b> El texto jurídico que salga de un formato de la Empresa sigue siendo contenido de la Empresa. El Licenciante no garantiza que ese texto esté actualizado ni que un contrato generado reemplace la revisión jurídica de la Empresa. La Empresa revisa sus minutas."))
    story.append(p("<b>7.4.</b> El día en que termine la licencia, el Licenciante deja de usar esos logos y esos textos y los retira de cualquier cuenta que no sea la de la Empresa."))

    story.append(p("8.  DATOS PERSONALES", "H"))
    story.append(p("<b>8.1. Responsable.</b> La Empresa es la Responsable del Tratamiento de los datos personales que se cargan en el Software, en los términos de la Ley 1581 de 2012 y del Decreto 1074 de 2015. Ella decide para qué se usan. Ella debe tener la base legal y, cuando haga falta, la autorización de los titulares. Ella atiende los reclamos de los titulares."))
    story.append(p("<b>8.2. Encargado.</b> El Licenciante es Encargado del Tratamiento. Trata esos datos solo por cuenta de la Empresa y solo para las finalidades del anexo. No es el dueño de la base. No puede venderla, cederla ni usarla para otro cliente."))
    story.append(p("<b>8.3. Qué no se hace con esa base.</b> El Licenciante no usa los datos de la Empresa para entrenar modelos de inteligencia artificial, no los cruza con bases de otros clientes y no se queda con una copia personal «por si acaso»."))
    story.append(p("<b>8.4. Instrucción.</b> La instrucción de la Empresa es operar el Software para las finalidades del anexo, con los usuarios que ella autorice. Cualquier uso distinto tiene que pedirse por escrito. Si una instrucción contradice la ley, el Licenciante no está obligado a cumplirla y se lo advierte a la Empresa."))
    story.append(p("<b>8.5. Seguridad y acceso.</b> El ingreso es con usuario. Cada persona ve solo lo que su perfil permite. El Licenciante no publica las bases ni los documentos. Avisa a la Empresa, a más tardar dentro de los tres (3) días hábiles siguientes a cuando lo conozca, si hay un acceso no autorizado o una pérdida de esa información."))
    story.append(p("<b>8.6. Otros proveedores.</b> El Licenciante puede apoyar el servicio en un proveedor de alojamiento o de infraestructura. Le informará a la Empresa el nombre de ese proveedor cuando ella lo pida. Ese proveedor no queda autorizado a usar los datos para sus propios fines."))
    story.append(p("<b>8.7. Derechos de las personas.</b> Si un titular pide consulta, corrección o supresión, el Licenciante pasa la solicitud a la Empresa dentro de los tres (3) días hábiles siguientes. La respuesta al titular la da la Empresa."))
    story.append(p("<b>8.8. Fotos de documentos.</b> Las imágenes de cédulas, licencias de tránsito y tarjetas se guardan solo para armar el expediente de vinculación que la Empresa pide. No se usan para identificar biométricamente a nadie ni para un fin distinto."))
    story.append(p("<b>8.9.</b> El Licenciante informa a la Empresa lo que ella necesite para registrar la base ante la Superintendencia de Industria y Comercio, si a ella le corresponde hacerlo. La política de tratamiento que se publique frente a los titulares es la de la Empresa. El Licenciante no se anuncia como responsable de esos datos."))

    story.append(p("9.  CONFIDENCIALIDAD", "H"))
    story.append(p("Cada parte guarda reserva de lo que reciba de la otra y que no sea público: el código y el diseño del Software, y de parte de la Empresa sus bases, precios, procesos, documentos y datos de personas. Esta reserva dura mientras exista la información reservada y, como mínimo, cinco (5) años después de terminado el contrato. No impide entregar información cuando un juez o una autoridad competente lo ordene, caso en el cual se avisa a la otra parte si la ley lo permite."))

    story.append(p("10.  EL CONTRATO DE TRABAJO SIGUE IGUAL", "H"))
    story.append(p("<b>10.1.</b> Este contrato no modifica el salario, el horario, el cargo ni la subordinación. No es una renuncia de salarios, prestaciones ni de ningún derecho laboral que la ley tenga por irrenunciable."))
    story.append(p("<b>10.2.</b> Crear, mantener o mejorar el Software no queda convertido en función del cargo. El Licenciante no está obligado a desarrollar funciones nuevas. Lo que haga de más sobre el programa se entiende hecho como licenciante, no como una orden nueva de trabajo, salvo que las partes lo escriban y lo reconozcan aparte."))
    story.append(p("<b>10.3.</b> Terminar esta licencia no es, por sí solo, una renuncia al trabajo ni un despido. Terminar el trabajo no le pasa la propiedad del Software a la Empresa."))
    story.append(p("<b>10.4.</b> Si una cláusula general del contrato de trabajo dice que todo lo que el trabajador cree pertenece a la Empresa, para este Software prevalece este pacto especial, que es posterior y específico."))

    story.append(p("11.  HASTA DÓNDE LLEGA EL SERVICIO", "H"))
    story.append(p("El Software se entrega como herramienta de apoyo. El Licenciante no promete que no tenga errores, ni que un contrato impreso salga con validez por el solo hecho de generarse en la plataforma. La Empresa revisa la información y los documentos antes de usarlos con un tercero. Ninguna de las dos partes responde por lucro cesante de la otra. Nada de esto limita la responsabilidad que la ley no permita limitar, ni los deberes frente a los titulares de datos."))

    story.append(p("12.  DURACIÓN Y TERMINACIÓN", "H"))
    story.append(p("<b>12.1.</b> Este contrato empieza el día en que lo firman las dos partes. Dura mientras dure el contrato de trabajo y, si las partes firman la licencia de pago de la cláusula 6.1, durante el tiempo de esa licencia."))
    story.append(p("<b>12.2.</b> Cualquiera de las dos partes puede terminar la licencia con un aviso escrito de treinta (30) días calendario. También termina si el contrato de trabajo termina y no se firma la licencia de pago dentro de los treinta días de la cláusula 6.1, o si una parte incumple un deber grave de datos, de confidencialidad o de uso de marcas y no lo corrige en los quince (15) días siguientes al reclamo escrito."))
    story.append(p("<b>12.3. Qué pasa al terminar.</b>"))
    story.append(p("<b>a)</b> La Empresa deja de usar el Software y no se queda con copias del programa.", "Btight"))
    story.append(p("<b>b)</b> El Licenciante entrega a la Empresa, en archivo de uso común (por ejemplo Excel o CSV) y dentro de los quince (15) días hábiles siguientes, los datos y documentos que sean de ella y que estén en la plataforma.", "Btight"))
    story.append(p("<b>c)</b> Cumplida esa entrega, el Licenciante borra esas bases y esos documentos de sus sistemas y de las copias que estén bajo su control, salvo lo que una ley lo obligue a conservar. Lo que deba conservar queda bloqueado y no se usa.", "Btight"))
    story.append(p("<b>d)</b> El Licenciante le entrega a la Empresa una constancia breve de esa entrega y de ese borrado.", "Btight"))
    story.append(p("<b>e)</b> El Licenciante retira los logos y las minutas de la Empresa.", "Btight"))
    story.append(p("<b>f)</b> La propiedad del Software sigue siendo del Licenciante. La propiedad de los datos, las marcas y las minutas sigue siendo de la Empresa o de sus titulares.", "Btight"))

    story.append(p("13.  CESIÓN DE ESTE CONTRATO", "H"))
    story.append(p("La Empresa no puede pasar esta licencia a nadie sin autorización escrita del Licenciante. El Licenciante puede ceder la titularidad del Software y su posición en este contrato a una sociedad de la que él sea dueño, avisándole por escrito a la Empresa. La licencia de la Empresa sigue igual."))

    story.append(p("14.  LEY APLICABLE", "H"))
    story.append(p("Este contrato se rige por la ley colombiana. Cualquier diferencia se intenta conciliar primero, en un centro de conciliación de Bogotá D.C. Si no hay acuerdo, deciden los jueces de Bogotá D.C."))

    story.append(p("15.  ACUERDO COMPLETO", "H"))
    story.append(p("Este documento, con su anexo, es lo que las partes acuerdan sobre la propiedad del Software, la licencia y los datos. Lo que no quedó escrito aquí no se entiende pactado. Los espacios en blanco que no se llenen se tachan antes de firmar. Si la Opción B de la cláusula 6 queda en blanco, rige la Opción A. El contrato de trabajo sigue rigiendo lo laboral, con la precisión de la cláusula 10.4."))
    story.append(p("Se firma en dos ejemplares del mismo valor, en físico o por firma electrónica según la Ley 527 de 1999. Cada parte iniciala cada hoja."))

    story.append(Spacer(1, 16))
    story.append(p("En constancia, se firma en Bogotá D.C. en la fecha de la primera página.", "B"))
    story.append(Spacer(1, 18))

    def sign_block(titulo, detalle):
        data = [
            [Paragraph(titulo, S["SignName"])],
            [Spacer(1, 36)],
            [""],
            [Paragraph(detalle, S["SignRole"])],
        ]
        t = Table(data, colWidths=[8.0 * cm])
        t.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEABOVE", (0, 2), (0, 2), 0.8, RULE),
            ("TOPPADDING", (0, 2), (0, 2), 8),
            ("BOTTOMPADDING", (0, 1), (0, 1), 0),
            ("TOPPADDING", (0, 1), (0, 1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 3), (0, 3), 2),
        ]))
        return t

    left = sign_block(
        "EL LICENCIANTE",
        "David Santiago Jaimes Peña<br/>C.C. 1.065.864.538",
    )
    right = sign_block(
        "LA EMPRESA",
        "Razón social: _______________________________<br/>Nombre: ___________________________________<br/>C.C. _____________________________________<br/>Cargo: ____________________________________",
    )
    signs = Table([[left, right]], colWidths=[8.5 * cm, 8.5 * cm])
    signs.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(signs)
    story.append(Spacer(1, 14))
    story.append(p("Quien firma por la Empresa declara que tiene facultades suficientes para obligarla en este contrato.", "CenterSmall"))

    story.append(PageBreak())
    story.append(p("ANEXO. TRATAMIENTO DE DATOS PERSONALES", "DocTitle"))
    story.append(p("Hace parte del contrato. La Empresa es la Responsable. El Licenciante es el Encargado.", "DocSub"))
    story.append(HRFlowable(width="100%", thickness=1, color=RULE, spaceAfter=8))

    story.append(p("1. Categorías de datos", "H"))
    story.append(p("Datos de identificación y contacto de propietarios, copropietarios y personas de contacto: nombres, tipo y número de documento, teléfono, correo y dirección.", "Btight"))
    story.append(p("Datos del vehículo asociados a esa gestión: placa, marca, línea, clase, modelo, números de motor, serie y chasis, carrocería, cilindraje, combustible, capacidad y empresa de transporte actual.", "Btight"))
    story.append(p("Imágenes de documentos que la Empresa cargue, como cédula, licencia de tránsito y tarjeta de operación.", "Btight"))
    story.append(p("Gestión comercial e interna: tipificaciones de llamadas, seguimientos, bitácora, control de jornada y usuarios de los asesores (nombre y usuario de acceso).", "Btight"))
    story.append(p("El Software no está destinado a tratar datos de niños, niñas o adolescentes. Si un documento los trajera, la Empresa decide y el Licenciante se limita a lo que ella instruya por escrito.", "Btight"))

    story.append(p("2. Finalidades", "H"))
    story.append(p("Gestionar vinculaciones y afiliaciones de la Empresa. Contactar y hacer seguimiento a las personas que la Empresa ya incorporó a su gestión. Armar expedientes y soportes documentales. Llevar el control interno del trabajo de los asesores. Producir estadísticas de la operación de esta Empresa, no de otros clientes.", "Btight"))

    story.append(p("3. Límites del Encargado", "H"))
    story.append(p("Tratar los datos solo según este anexo y las instrucciones escritas de la Empresa. No venderlos ni cederlos. No usarlos para otra empresa. No usarlos para entrenar inteligencia artificial. No conservarlos después de la devolución y el borrado de la cláusula 12, salvo deber legal. Avisar incidentes en el plazo de la cláusula 8.5. Devolver y borrar al terminar, en el plazo de la cláusula 12.3.", "Btight"))

    story.append(p("4. Encargados posteriores", "H"))
    story.append(p("Proveedor de alojamiento o infraestructura:", "Btight"))
    story.append(p("_________________________________________________________________________.", "Bleft"))
    story.append(p("La Empresa puede objetarlo por escrito en los diez (10) días hábiles siguientes a que se le informe, si tiene una razón de seguridad o de cumplimiento. Si esa línea queda en blanco, el Licenciante informa el proveedor en cuanto la Empresa lo pida."))

    story.append(Spacer(1, 18))
    story.append(p("Las partes inicialan este anexo junto con el contrato.", "B"))
    story.append(Spacer(1, 28))
    mini = Table([[left, right]], colWidths=[8.5 * cm, 8.5 * cm])
    mini.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(mini)

    doc.build(story, onFirstPage=footer_contrato, onLaterPages=footer_contrato)


def build_carta():
    doc = SimpleDocTemplate(
        OUT_CARTA, pagesize=letter,
        leftMargin=2.3 * cm, rightMargin=2.3 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Carta de envío del contrato de licencia",
        author="David Santiago Jaimes Peña",
    )
    story = []
    story.append(p("Bogotá D.C., ______ de ________________________ de 2026", "Letter"))
    story.append(Spacer(1, 8))
    story.append(p("Señores", "LetterHead"))
    story.append(p("_______________________________________________<br/>Representante legal<br/>Ciudad", "Letter"))
    story.append(p("<b>Asunto:</b> licencia de uso de la herramienta de vinculaciones y tratamiento de datos", "Letter"))
    story.append(p("Por medio de esta carta les presento un contrato corto para que la empresa pueda seguir usando, con permiso y por escrito, la herramienta que yo desarrollé para organizar las vinculaciones, las llamadas y los documentos."))
    story.append(p("La construí por mi propia iniciativa. No me la encargaron como desarrollo de software y no la hice con equipos ni licencias compradas por la empresa. Me sirve dejar eso claro, y también les sirve a ustedes: los datos de los propietarios, las fotos, los logos y el texto de los contratos siguen siendo de la empresa. Yo no me quedo con esa base y no la uso para nadie más."))
    story.append(p("El contrato propone tres cosas concretas. Primera: el programa sigue siendo mío y la empresa recibe un permiso de uso, no la propiedad. Segunda: mientras yo esté vinculado, ese uso no tiene cobro adicional. Si más adelante dejo de trabajar y la empresa quiere seguir usándolo, se firma una licencia de pago. Tercera: la empresa queda como responsable de los datos personales y yo solo los trato por cuenta de ella, con el deber de devolverlos y borrarlos si el permiso se acaba."))
    story.append(p("Les pido que lo revise quien lleve los asuntos jurídicos y que lo firme el representante legal, porque un jefe de equipo no obliga a la sociedad. Si el nombre comercial de la operación es distinto de la razón social del contrato de trabajo, en el documento va la razón social y el NIT."))
    story.append(p("Quedo atento a las observaciones. Los espacios en blanco se llenan o se tachan antes de firmar, y cada parte se queda con una copia."))
    story.append(Spacer(1, 22))
    story.append(p("Cordialmente,", "Letter"))
    story.append(Spacer(1, 32))
    story.append(HRFlowable(width="55%", thickness=0.6, color=RULE, spaceBefore=0, spaceAfter=4, hAlign="LEFT"))
    story.append(p("<b>David Santiago Jaimes Peña</b><br/>C.C. 1.065.864.538<br/>Celular: ______________________________<br/>Correo: _______________________________", "Letter"))
    story.append(Spacer(1, 10))
    story.append(p("Anexo: Contrato de licencia de uso de software, pacto sobre derechos de autor y encargo de tratamiento de datos personales.", "Small"))
    doc.build(story, onFirstPage=footer_carta, onLaterPages=footer_carta)


if __name__ == "__main__":
    build_contrato()
    build_carta()
    print("ok")
