import { useEffect, useState } from "react";
import { CatalogoDatos } from "@/components/catalogo-datos";
import { EditorContrato } from "@/components/gerencia-contrato";
import { CAMPOS_CONTRATO, TEXTOS_BASE, parteDeDoc, type CampoContrato, type CiudadConfig, configBase } from "@/lib/gerencia";
import { configMia, guardarCiudadMia, guardarFormatoMio, parteContrato, pdfMio } from "@/lib/gerencia.functions";

const ASUNTO = TEXTOS_BASE.find((item) => item.clave === "correo_firma_asunto")?.valor ?? "";
const CUERPO = TEXTOS_BASE.find((item) => item.clave === "correo_firma_cuerpo")?.valor ?? "";

export function FormatoCiudad() {
  const [pdf, setPdf] = useState("");
  const [oficial, setOficial] = useState(true);
  const [ciudadId, setCiudadId] = useState(0);
  const [campos, setCampos] = useState<CampoContrato[]>(CAMPOS_CONTRATO);
  const [config, setConfig] = useState<CiudadConfig>(configBase());
  const [asunto, setAsunto] = useState(ASUNTO);
  const [cuerpo, setCuerpo] = useState(CUERPO);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<"datos" | "documentos" | "pasos" | "contrato" | "correo">("datos");
  const [docNuevo, setDocNuevo] = useState("");
  const [pasoNuevo, setPasoNuevo] = useState("");

  useEffect(() => {
    void pdfMio()
      .then((dato) => {
        setPdf(dato.pdf);
        setOficial(dato.oficial);
        setCiudadId(dato.ciudadId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pude abrir el contrato"));
    void configMia()
      .then((dato) => {
        setConfig(dato);
        if (dato.contratoCampos.length) setCampos(dato.contratoCampos);
        setAsunto(dato.textos.correo_firma_asunto || ASUNTO);
        setCuerpo(dato.textos.correo_firma_cuerpo || CUERPO);
      })
      .catch(() => {});
  }, []);

  async function guardar() {
    setOcupado(true);
    setError("");
    try {
      await guardarFormatoMio({ data: { asunto, cuerpo, campos } });
      await guardarCiudadMia({ data: { ...config, contratoCampos: campos, textos: { ...config.textos, correo_firma_asunto: asunto, correo_firma_cuerpo: cuerpo } } });
      setAviso("Quedó guardado para esta ciudad.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude guardar");
    } finally {
      setOcupado(false);
    }
  }

  const partes = ["Inicio", "Seguimiento", "Documentos", "Firma", "Póliza", "Tarjeta"];
  const grupos = ["Inicio", "Documentos", "Firma", "Póliza", "Tarjeta", "Operativa", "Vía Seguros", "Servicio", "Extra"];

  return (
    <section className="mt-5 grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["datos", "Datos"],
            ["documentos", "Documentos"],
            ["pasos", "Pasos"],
            ["contrato", "Contrato"],
            ["correo", "Correo"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setVista(id)} className={"h-10 rounded-2xl px-3 text-sm font-semibold " + (vista === id ? "bg-navy text-paper" : "border border-line")}>
            {label}
          </button>
        ))}
        <button type="button" disabled={ocupado} onClick={() => void guardar()} className="h-10 rounded-2xl bg-lime px-4 text-sm font-semibold">
          {ocupado ? "Guardando…" : "Guardar esta ciudad"}
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {aviso ? <p className="rounded-2xl bg-lime px-3 py-2 text-sm">{aviso}</p> : null}

      {vista === "datos" ? (
        <div className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Todos los datos</h2>
          <p className="mt-1 text-sm text-ink-soft">Marca cuáles van en el contrato, crea datos nuevos y elige en qué parte del proceso se piden. Coordinación configura esto para su ciudad.</p>
          <div className="mt-4">
            <CatalogoDatos campos={campos} onChange={setCampos} />
          </div>
        </div>
      ) : null}

      {vista === "documentos" ? (
        <div className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Dónde se piden los documentos</h2>
          <div className="mt-3 grid gap-2">
            {config.documentos.map((doc, index) => (
              <div key={doc.id} className="grid items-center gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_11rem_5rem_auto]">
                <input
                  value={doc.label}
                  onChange={(event) => {
                    const documentos = config.documentos.slice();
                    documentos[index] = { ...doc, label: event.target.value };
                    setConfig({ ...config, documentos });
                  }}
                  className="h-10 rounded-xl border border-line px-3 text-sm"
                />
                <select
                  value={doc.parte || parteDeDoc(doc.id)}
                  onChange={(event) => {
                    const documentos = config.documentos.slice();
                    documentos[index] = { ...doc, parte: event.target.value };
                    setConfig({ ...config, documentos });
                  }}
                  className="h-10 rounded-xl border border-line px-2 text-sm"
                >
                  {partes.map((nombre) => (
                    <option key={nombre}>{nombre}</option>
                  ))}
                </select>
                <label className="text-xs text-ink-soft">
                  Copias
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={doc.copias}
                    onChange={(event) => {
                      const documentos = config.documentos.slice();
                      documentos[index] = { ...doc, copias: Number(event.target.value) || 1 };
                      setConfig({ ...config, documentos });
                    }}
                    className="mt-1 h-10 w-full rounded-xl border border-line px-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={doc.activo}
                    onChange={(event) => {
                      const documentos = config.documentos.slice();
                      documentos[index] = { ...doc, activo: event.target.checked };
                      setConfig({ ...config, documentos });
                    }}
                  />
                  Pedirlo
                </label>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const id = docNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
              if (id.length < 3 || config.documentos.some((doc) => doc.id === id)) return;
              setConfig({ ...config, documentos: [...config.documentos, { id, label: docNuevo.trim(), obligatorio: false, copias: 1, vigencia: false, activo: true, parte: "Documentos" }] });
              setDocNuevo("");
            }}
          >
            <input value={docNuevo} onChange={(event) => setDocNuevo(event.target.value)} placeholder="Documento nuevo" className="h-11 flex-1 rounded-2xl border border-line px-3" />
            <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
          </form>
        </div>
      ) : null}

      {vista === "pasos" ? (
        <div className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Pasos de esta ciudad</h2>
          <p className="mt-1 text-sm text-ink-soft">Cada paso se ve en la parte del proceso que elijas.</p>
          {grupos.map((grupo) => {
            const lista = config.pasos.map((paso, index) => ({ paso, index })).filter((item) => item.paso.grupo === grupo);
            if (!lista.length) return null;
            return (
              <div key={grupo} className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">{grupo}</h3>
                <div className="mt-2 grid gap-2">
                  {lista.map(({ paso, index }) => (
                    <div key={paso.key} className="grid items-center gap-2 sm:grid-cols-[auto_1fr_11rem]">
                      <input
                        type="checkbox"
                        checked={paso.activo}
                        onChange={(event) => {
                          const pasos = config.pasos.slice();
                          pasos[index] = { ...paso, activo: event.target.checked };
                          setConfig({ ...config, pasos });
                        }}
                      />
                      <input
                        value={paso.label}
                        onChange={(event) => {
                          const pasos = config.pasos.slice();
                          pasos[index] = { ...paso, label: event.target.value };
                          setConfig({ ...config, pasos });
                        }}
                        className="h-10 rounded-xl border border-line px-3 text-sm"
                      />
                      <select
                        value={paso.grupo}
                        onChange={(event) => {
                          const pasos = config.pasos.slice();
                          pasos[index] = { ...paso, grupo: event.target.value };
                          setConfig({ ...config, pasos });
                        }}
                        className="h-10 rounded-xl border border-line px-2 text-sm"
                      >
                        {grupos.map((nombre) => (
                          <option key={nombre}>{nombre}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const key = "extra_" + pasoNuevo.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
              if (key.length < 8 || config.pasos.some((paso) => paso.key === key)) return;
              setConfig({ ...config, pasos: [...config.pasos, { key, label: pasoNuevo.trim(), grupo: "Documentos", activo: true }] });
              setPasoNuevo("");
            }}
          >
            <input value={pasoNuevo} onChange={(event) => setPasoNuevo(event.target.value)} placeholder="Paso nuevo" className="h-11 flex-1 rounded-2xl border border-line px-3" />
            <button type="submit" className="h-11 rounded-2xl border border-line px-3 text-sm font-semibold">Agregar</button>
          </form>
        </div>
      ) : null}

      {vista === "contrato" ? (
        <div className="rounded-card border border-line bg-card p-4">
          <h2 className="font-semibold">Contrato de esta ciudad</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {oficial ? "Estás viendo el contrato de siempre. Si lo acomodas y guardas, solo cambia para tu ciudad." : "Este PDF es solo de tu ciudad. Arrastra cada dato a su sitio."}
          </p>
          <label className="mt-3 inline-flex h-11 cursor-pointer items-center rounded-2xl border border-line px-3 text-sm font-semibold">
            Subir PDF
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file || !ciudadId) return;
                setOcupado(true);
                const reader = new FileReader();
                reader.onload = () => {
                  const crudo = String(reader.result ?? "");
                  const datos = crudo.includes(",") ? crudo.slice(crudo.indexOf(",") + 1) : crudo;
                  const cargaId = crypto.randomUUID();
                  const tope = 500_000;
                  void (async () => {
                    try {
                      for (let i = 0, orden = 0; i < datos.length; i += tope, orden += 1) {
                        await parteContrato({
                          data: { ciudadId, cargaId, orden, datos: datos.slice(i, i + tope), fin: i + tope >= datos.length, nombre: file.name, campos },
                        });
                      }
                      setPdf(datos);
                      setOficial(false);
                      setAviso("PDF listo. Acomoda los datos y guarda.");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "No pude subir el formato");
                    } finally {
                      setOcupado(false);
                    }
                  })();
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {pdf ? <div className="mt-4"><EditorContrato pdf={pdf} campos={campos} onChange={setCampos} /></div> : <p className="mt-3 text-sm text-ink-soft">Cargando el contrato…</p>}
        </div>
      ) : null}

      {vista === "correo" ? (
      <div className="rounded-card border border-line bg-card p-4">
        <h2 className="font-semibold">Correo de firma de esta ciudad</h2>
        <p className="mt-1 text-sm text-ink-soft">El correo sale de vinculaciones@. {"{nombre}"} y {"{placa}"} se llenan solos.</p>
        <label className="mt-4 grid gap-1 text-sm font-semibold">
          Asunto
          <input value={asunto} onChange={(event) => setAsunto(event.target.value)} className="h-11 rounded-2xl border border-line px-3 font-normal" />
        </label>
        <label className="mt-3 grid gap-1 text-sm font-semibold">
          Mensaje
          <textarea value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} rows={8} className="rounded-2xl border border-line px-3 py-2 font-normal" />
        </label>
      </div>
      ) : null}
    </section>
  );
}
