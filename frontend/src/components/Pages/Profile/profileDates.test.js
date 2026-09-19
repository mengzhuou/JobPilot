import { formatProfileMonth } from "./profileDates";

test.each([
    ["2022-08", "Aug 2022"],
    ["2022-08-14", "Aug 2022"],
    ["August 2022", "Aug 2022"],
    ["aug 2022", "Aug 2022"],
    ["Present", "Present"],
    ["", ""],
    ["not a date", "not a date"],
])("formats %s as %s", (input, expected) => {
    expect(formatProfileMonth(input)).toBe(expected);
});
