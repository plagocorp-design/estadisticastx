export const MARCAS = [
  "CHEVROLET",
  "RENAULT",
  "KIA",
  "HYUNDAI",
  "NISSAN",
  "MAZDA",
  "TOYOTA",
  "SUZUKI",
  "VOLKSWAGEN",
  "FIAT",
  "FORD",
  "BYD",
  "JAC",
  "CHANGAN",
  "DFSK",
  "MG",
];

export const LINEAS: Record<string, string[]> = {
  CHEVROLET: ["SPARK", "SPARK GT", "SPARK LIFE", "SAIL", "BEAT", "ONIX", "AVEO", "TRACKER", "CAPTIVA"],
  RENAULT: ["LOGAN", "SANDERO", "STEPWAY", "SYMBOL", "DUSTER", "KWID", "OROCH"],
  KIA: ["PICANTO", "PICANTO EKOTAXI", "RIO", "CERATO", "SPORTAGE", "SOLUTO", "SELTOS"],
  HYUNDAI: ["GRAND I10", "I10", "ATOS", "ACCENT", "VENUE", "CRETA", "TUCSON"],
  NISSAN: ["MARCH", "VERSA", "SENTRA", "KICKS", "QASHQAI"],
  MAZDA: ["MAZDA 2", "MAZDA 3", "CX-3", "CX-30", "CX-5"],
  TOYOTA: ["YARIS", "COROLLA", "RUSH", "FORTUNER"],
  SUZUKI: ["SWIFT", "ALTO", "BALENO", "VITARA", "S-PRESSO"],
  VOLKSWAGEN: ["GOL", "VOYAGE", "POLO", "VIRTUS", "T-CROSS"],
  FIAT: ["MOBI", "ARGO", "CRONOS", "PULSE", "STRADA"],
  BYD: ["DOLPHIN", "YUAN", "SONG"],
  JAC: ["JS2", "JS3", "S2"],
};

export const CLASES = ["AUTOMOVIL", "CAMIONETA", "CAMPERO"];
export const CARROCERIAS = ["SEDAN", "HATCHBACK", "STATION WAGON", "COUPE", "CAMIONETA", "VAN"];
export const COMBUSTIBLES = ["GASOLINA", "DIESEL", "GAS NATURAL", "GASOLINA Y GAS", "ELECTRICO", "HIBRIDO"];
export const SERVICIOS = ["PUBLICO", "PARTICULAR", "OFICIAL", "DIPLOMATICO"];

export function acercar(valor: string, opciones: string[]) {
  const base = valor.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return "";
  const exacta = opciones.find((opcion) => opcion === base);
  if (exacta) return exacta;
  return opciones.find((opcion) => base.includes(opcion) || opcion.includes(base)) ?? valor.toUpperCase().slice(0, 40);
}
