import { describe, expect, it } from "vitest";

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return "Good Morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good Afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
}

function formatDate(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();

  const suffix =
    dayNum === 1 || dayNum === 21 || dayNum === 31
      ? "st"
      : dayNum === 2 || dayNum === 22
        ? "nd"
        : dayNum === 3 || dayNum === 23
          ? "rd"
          : "th";

  return `${dayName}, ${monthName} ${dayNum}${suffix}`;
}

describe("chat-greeting functions", () => {
  describe("getGreeting", () => {
    it("should return 'Good Morning' for 5 AM", () => {
      expect(getGreeting(5)).toBe("Good Morning");
    });

    it("should return 'Good Morning' for 11 AM", () => {
      expect(getGreeting(11)).toBe("Good Morning");
    });

    it("should return 'Good Afternoon' for 12 PM", () => {
      expect(getGreeting(12)).toBe("Good Afternoon");
    });

    it("should return 'Good Afternoon' for 4 PM (16:00)", () => {
      expect(getGreeting(16)).toBe("Good Afternoon");
    });

    it("should return 'Good Evening' for 5 PM (17:00)", () => {
      expect(getGreeting(17)).toBe("Good Evening");
    });

    it("should return 'Good Evening' for 8 PM (20:00)", () => {
      expect(getGreeting(20)).toBe("Good Evening");
    });

    it("should return 'Good Night' for 9 PM (21:00)", () => {
      expect(getGreeting(21)).toBe("Good Night");
    });

    it("should return 'Good Night' for midnight (0:00)", () => {
      expect(getGreeting(0)).toBe("Good Night");
    });

    it("should return 'Good Night' for 4 AM", () => {
      expect(getGreeting(4)).toBe("Good Night");
    });

    it("should handle all 24 hours correctly", () => {
      const expectedGreetings: Record<number, string> = {
        0: "Good Night",
        1: "Good Night",
        2: "Good Night",
        3: "Good Night",
        4: "Good Night",
        5: "Good Morning",
        6: "Good Morning",
        7: "Good Morning",
        8: "Good Morning",
        9: "Good Morning",
        10: "Good Morning",
        11: "Good Morning",
        12: "Good Afternoon",
        13: "Good Afternoon",
        14: "Good Afternoon",
        15: "Good Afternoon",
        16: "Good Afternoon",
        17: "Good Evening",
        18: "Good Evening",
        19: "Good Evening",
        20: "Good Evening",
        21: "Good Night",
        22: "Good Night",
        23: "Good Night",
      };

      for (let hour = 0; hour < 24; hour++) {
        expect(getGreeting(hour)).toBe(expectedGreetings[hour]);
      }
    });
  });

  describe("formatDate", () => {
    it("should format a date with correct day name", () => {
      const date = new Date(2024, 0, 1);
      const result = formatDate(date);
      expect(result).toContain("Monday");
    });

    it("should format a date with correct month name", () => {
      const date = new Date(2024, 0, 15);
      const result = formatDate(date);
      expect(result).toContain("January");
    });

    it("should format a date with correct day number", () => {
      const date = new Date(2024, 5, 15);
      const result = formatDate(date);
      expect(result).toContain("15");
    });

    it("should add 'st' suffix for 1st", () => {
      const date = new Date(2024, 0, 1);
      const result = formatDate(date);
      expect(result).toContain("1st");
    });

    it("should add 'nd' suffix for 2nd", () => {
      const date = new Date(2024, 0, 2);
      const result = formatDate(date);
      expect(result).toContain("2nd");
    });

    it("should add 'rd' suffix for 3rd", () => {
      const date = new Date(2024, 0, 3);
      const result = formatDate(date);
      expect(result).toContain("3rd");
    });

    it("should add 'th' suffix for 4th", () => {
      const date = new Date(2024, 0, 4);
      const result = formatDate(date);
      expect(result).toContain("4th");
    });

    it("should add 'th' suffix for 11th", () => {
      const date = new Date(2024, 0, 11);
      const result = formatDate(date);
      expect(result).toContain("11th");
    });

    it("should add 'st' suffix for 21st", () => {
      const date = new Date(2024, 0, 21);
      const result = formatDate(date);
      expect(result).toContain("21st");
    });

    it("should add 'nd' suffix for 22nd", () => {
      const date = new Date(2024, 0, 22);
      const result = formatDate(date);
      expect(result).toContain("22nd");
    });

    it("should add 'rd' suffix for 23rd", () => {
      const date = new Date(2024, 0, 23);
      const result = formatDate(date);
      expect(result).toContain("23rd");
    });

    it("should add 'st' suffix for 31st", () => {
      const date = new Date(2024, 0, 31);
      const result = formatDate(date);
      expect(result).toContain("31st");
    });

    it("should format complete date correctly", () => {
      const date = new Date(2024, 11, 25);
      const result = formatDate(date);
      expect(result).toBe("Wednesday, December 25th");
    });

    it("should handle all months correctly", () => {
      const months = [
        { month: 0, name: "January" },
        { month: 1, name: "February" },
        { month: 2, name: "March" },
        { month: 3, name: "April" },
        { month: 4, name: "May" },
        { month: 5, name: "June" },
        { month: 6, name: "July" },
        { month: 7, name: "August" },
        { month: 8, name: "September" },
        { month: 9, name: "October" },
        { month: 10, name: "November" },
        { month: 11, name: "December" },
      ];

      months.forEach(({ month, name }) => {
        const date = new Date(2024, month, 15);
        const result = formatDate(date);
        expect(result).toContain(name);
      });
    });

    it("should handle all days of week correctly", () => {
      const days = [
        { date: new Date(2024, 0, 7), name: "Sunday" },
        { date: new Date(2024, 0, 8), name: "Monday" },
        { date: new Date(2024, 0, 9), name: "Tuesday" },
        { date: new Date(2024, 0, 10), name: "Wednesday" },
        { date: new Date(2024, 0, 11), name: "Thursday" },
        { date: new Date(2024, 0, 12), name: "Friday" },
        { date: new Date(2024, 0, 13), name: "Saturday" },
      ];

      days.forEach(({ date, name }) => {
        const result = formatDate(date);
        expect(result).toContain(name);
      });
    });
  });
});
