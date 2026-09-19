import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Loops from "./Loops";

jest.mock("../../../connector", () => ({ getProfileLocations: jest.fn().mockResolvedValue([]) }));

test("opens Loop creation and requires the three starter details", () => {
    render(<Loops />);
    expect(screen.getByRole("heading", { name: "My Loops" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New Loop/i }));
    expect(screen.getByRole("heading", { name: "Set up your job search" })).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Create Loop" }).closest("form"));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one job title");
});
