import { describe, expect, it } from "vitest";
import {
  detectPeriod,
  formatMinutes,
  groupByEmployeeAndDay,
  parseTxtContent,
  recalcFromTimestamps,
  toTitleCase,
} from "./timesheetParser";

const SAMPLE_CONTENT = `Tra. No.\tNome\tdept.\tTempo\tMáquina No.
3\tELAINE\tPRODUCAO\t 02.02.2026     05:50:06\t1
3\tELAINE\tPRODUCAO\t 02.02.2026     12:01:47\t1
3\tELAINE\tPRODUCAO\t 02.02.2026     12:55:08\t1
3\tELAINE\tPRODUCAO\t 02.02.2026     16:00:06\t1
4\tRAQUEL\tPRODUCAO\t 02.02.2026     05:51:52\t1
4\tRAQUEL\tPRODUCAO\t 02.02.2026     12:05:50\t1
4\tRAQUEL\tPRODUCAO\t 02.02.2026     13:02:15\t1
4\tRAQUEL\tPRODUCAO\t 02.02.2026     16:26:28\t1
`;

const SAMPLE_6_RECORDS = `3\tELAINE\tPRODUCAO\t 03.02.2026     05:50:02\t1
3\tELAINE\tPRODUCAO\t 03.02.2026     09:00:00\t1
3\tELAINE\tPRODUCAO\t 03.02.2026     09:15:00\t1
3\tELAINE\tPRODUCAO\t 03.02.2026     12:07:07\t1
3\tELAINE\tPRODUCAO\t 03.02.2026     12:57:45\t1
3\tELAINE\tPRODUCAO\t 03.02.2026     15:59:33\t1
`;

describe("parseTxtContent", () => {
  it("should parse valid TXT content", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    expect(records.length).toBe(8);
  });

  it("should skip header line", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    // All records should have numeric codes
    for (const r of records) {
      expect(typeof r.employeeCode).toBe("number");
      expect(r.employeeCode).toBeGreaterThan(0);
    }
  });

  it("should parse date and time correctly using UTC", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    const first = records[0]!;
    expect(first.employeeCode).toBe(3);
    expect(first.employeeName).toBe("Elaine"); // normalizado para Title Case
    // Usa UTC para garantir que o horário do arquivo seja preservado exatamente
    expect(first.recordedAt.getUTCFullYear()).toBe(2026);
    expect(first.recordedAt.getUTCMonth()).toBe(1); // February = 1
    expect(first.recordedAt.getUTCDate()).toBe(2);
    expect(first.recordedAt.getUTCHours()).toBe(5);
    expect(first.recordedAt.getUTCMinutes()).toBe(50);
  });

  it("should return empty array for empty content", () => {
    expect(parseTxtContent("")).toHaveLength(0);
    expect(parseTxtContent("   \n\n  ")).toHaveLength(0);
  });
});

describe("groupByEmployeeAndDay", () => {
  it("should group 4 records per day correctly", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    const groups = groupByEmployeeAndDay(records);

    // Should have 2 groups (ELAINE day 02 and RAQUEL day 02)
    expect(groups.length).toBe(2);

    const elaine = groups.find((g) => g.employeeCode === 3);
    expect(elaine).toBeDefined();
    expect(elaine!.records.length).toBe(4);
    expect(elaine!.hasIssue).toBe(false);
  });

  it("should calculate hours correctly for 4-record day", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    const groups = groupByEmployeeAndDay(records);

    const elaine = groups.find((g) => g.employeeCode === 3)!;
    // Pair 1: 05:50 → 12:01 = 371 min
    // Pair 2: 12:55 → 16:00 = 185 min
    // Total ≈ 556 min
    expect(elaine.totalMinutes).toBeGreaterThan(500);
    expect(elaine.totalMinutes).toBeLessThan(600);
  });

  it("should handle 6 records per day without issue flag", () => {
    const records = parseTxtContent(SAMPLE_6_RECORDS);
    const groups = groupByEmployeeAndDay(records);
    expect(groups.length).toBe(1);
    expect(groups[0]!.records.length).toBe(6);
    expect(groups[0]!.hasIssue).toBe(false);
  });

  it("should flag odd number of records as issue", () => {
    const oddContent = `3\tELAINE\tPRODUCAO\t 04.02.2026     05:50:00\t1
3\tELAINE\tPRODUCAO\t 04.02.2026     12:00:00\t1
3\tELAINE\tPRODUCAO\t 04.02.2026     13:00:00\t1
`;
    const records = parseTxtContent(oddContent);
    const groups = groupByEmployeeAndDay(records);
    expect(groups[0]!.hasIssue).toBe(true);
    expect(groups[0]!.issueDescription).toContain("ímpar");
  });

  it("should flag 2-record day as issue", () => {
    const twoRecords = `3\tELAINE\tPRODUCAO\t 05.02.2026     05:50:00\t1
3\tELAINE\tPRODUCAO\t 05.02.2026     12:00:00\t1
`;
    const records = parseTxtContent(twoRecords);
    const groups = groupByEmployeeAndDay(records);
    expect(groups[0]!.hasIssue).toBe(true);
    expect(groups[0]!.issueDescription).toContain("2 registros");
  });

  it("deve agrupar turno noturno: saída de madrugada pertence ao dia anterior", () => {
    // Turno: entra 22:00 dia 10, sai 02:00 dia 11
    const nightContent = `5\tSKARLAT\tPRODUCAO\t 10.02.2026     17:00:00\t1
5\tSKARLAT\tPRODUCAO\t 10.02.2026     21:00:00\t1
5\tSKARLAT\tPRODUCAO\t 10.02.2026     22:00:00\t1
5\tSKARLAT\tPRODUCAO\t 11.02.2026     02:00:00\t1
`;
    const records = parseTxtContent(nightContent);
    const groups = groupByEmployeeAndDay(records);
    // Deve ter apenas 1 grupo (dia 10) com 4 registros
    expect(groups.length).toBe(1);
    expect(groups[0]!.workDate).toBe("2026-02-10");
    expect(groups[0]!.records.length).toBe(4);
    expect(groups[0]!.hasIssue).toBe(false);
    // Total: (21:00-17:00) + (02:00+1dia - 22:00) = 240 + 240 = 480 min
    expect(groups[0]!.totalMinutes).toBe(480);
  });

  it("não deve mover madrugada para dia anterior se dia anterior não existe", () => {
    // Só tem registros de madrugada sem dia anterior
    const onlyNight = `5\tSKARLAT\tPRODUCAO\t 10.02.2026     02:00:00\t1
5\tSKARLAT\tPRODUCAO\t 10.02.2026     05:00:00\t1
`;
    const records = parseTxtContent(onlyNight);
    const groups = groupByEmployeeAndDay(records);
    // Deve manter no dia 10 (sem dia anterior para herdar)
    expect(groups.length).toBe(1);
    expect(groups[0]!.workDate).toBe("2026-02-10");
  });
});

describe("detectPeriod", () => {
  it("should detect period from records", () => {
    const records = parseTxtContent(SAMPLE_CONTENT);
    const { periodStart, periodEnd } = detectPeriod(records);
    expect(periodStart.getUTCDate()).toBe(2);
    expect(periodStart.getUTCMonth()).toBe(1);
    expect(periodEnd.getUTCDate()).toBe(2);
  });

  it("should return current date for empty records", () => {
    const { periodStart, periodEnd } = detectPeriod([]);
    expect(periodStart).toBeInstanceOf(Date);
    expect(periodEnd).toBeInstanceOf(Date);
  });
});

describe("toTitleCase", () => {
  it("converte CAIXA ALTA para Title Case", () => {
    expect(toTitleCase("ELAINE")).toBe("Elaine");
    expect(toTitleCase("RAQUEL")).toBe("Raquel");
    expect(toTitleCase("NATHASHA")).toBe("Nathasha");
  });

  it("converte capitalização mista para Title Case", () => {
    expect(toTitleCase("altamiRO")).toBe("Altamiro");
    expect(toTitleCase("ediSON")).toBe("Edison");
  });

  it("preserva nomes com múltiplas palavras", () => {
    expect(toTitleCase("MARIA IZADORA")).toBe("Maria Izadora");
    expect(toTitleCase("JUCELAINE PAES")).toBe("Jucelaine Paes");
    expect(toTitleCase("MIRELLI EVERS")).toBe("Mirelli Evers");
  });

  it("não altera nomes já em Title Case", () => {
    expect(toTitleCase("Elaine")).toBe("Elaine");
    expect(toTitleCase("Maria Izadora")).toBe("Maria Izadora");
  });

  it("aplica normalização ao parsear arquivo TXT", () => {
    const content = "3\tELAINE\tPRODUCAO\t 02.02.2026     05:50:06\t1";
    const records = parseTxtContent(content);
    expect(records[0]?.employeeName).toBe("Elaine");
  });

  it("normaliza nome misto ao parsear", () => {
    const content = "18\taltamiRO\tPRODUCAO\t 02.02.2026     05:50:06\t1";
    const records = parseTxtContent(content);
    expect(records[0]?.employeeName).toBe("Altamiro");
  });
});

describe("recalcFromTimestamps", () => {
  it("calcula minutos corretos de 4 timestamps", () => {
    const timestamps = [
      new Date("2026-02-02T05:50:00"),
      new Date("2026-02-02T12:00:00"),
      new Date("2026-02-02T13:00:00"),
      new Date("2026-02-02T17:30:00"),
    ];
    const result = recalcFromTimestamps(timestamps);
    expect(result.hasIssue).toBe(false);
    expect(result.totalMinutes).toBe(640); // 370 + 270
    expect(result.firstIn).toEqual(timestamps[0]);
    expect(result.lastOut).toEqual(timestamps[3]);
  });

  it("sinaliza número ímpar de registros como problema", () => {
    const timestamps = [
      new Date("2026-02-02T05:50:00"),
      new Date("2026-02-02T12:00:00"),
      new Date("2026-02-02T13:00:00"),
    ];
    const result = recalcFromTimestamps(timestamps);
    expect(result.hasIssue).toBe(true);
    expect(result.issueDescription).toContain("ímpar");
  });

  it("retorna hasIssue true para lista vazia", () => {
    const result = recalcFromTimestamps([]);
    expect(result.hasIssue).toBe(true);
    expect(result.totalMinutes).toBe(0);
    expect(result.firstIn).toBeNull();
    expect(result.lastOut).toBeNull();
  });

  it("ordena timestamps antes de calcular", () => {
    const timestamps = [
      new Date("2026-02-02T17:30:00"),
      new Date("2026-02-02T05:50:00"),
      new Date("2026-02-02T13:00:00"),
      new Date("2026-02-02T12:00:00"),
    ];
    const result = recalcFromTimestamps(timestamps);
    expect(result.hasIssue).toBe(false);
    expect(result.totalMinutes).toBe(640);
  });
});

describe("formatMinutes", () => {
  it("should format 0 minutes", () => {
    expect(formatMinutes(0)).toBe("00:00");
  });

  it("should format 90 minutes as 01:30", () => {
    expect(formatMinutes(90)).toBe("01:30");
  });

  it("should format 480 minutes as 08:00", () => {
    expect(formatMinutes(480)).toBe("08:00");
  });

  it("should format 556 minutes as 09:16", () => {
    expect(formatMinutes(556)).toBe("09:16");
  });
});
