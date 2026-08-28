import React, { useEffect, useState } from "react";
import "./FillApplication.css";
import Button from "../../Button/Button";
import { openAndFillApplication } from "../../../connector.js";

const FillApplication = () => {
    const [jobUrl, setJobUrl] = useState("");
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState("idle");

    // Connect to Playwright log stream
    useEffect(() => {
        const eventSource = new EventSource("/api/playwright/logs");

        eventSource.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data);

                setLogs((prev) => [...prev, log]);

                if (log.status) {
                    setStatus(log.status);
                }
            } catch (error) {
                console.error("Failed to parse Playwright log:", error);
            }
        };

        eventSource.onerror = () => {
            console.log("Playwright log connection closed");
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);

    const startApplication = async () => {
        if (!jobUrl.trim()) {
            return;
        }

        setLogs([]);
        setStatus("starting");

        try {
            // Use connector.js instead of directly calling fetch()
            const response = await openAndFillApplication(jobUrl);

            console.log("Application started:", response);

            setStatus("running");
        } catch (error) {
            console.error("Failed to start application:", error);

            setStatus("error");

            setLogs((prev) => [
                ...prev,
                {
                    message:
                        error.response?.data?.message ||
                        error.message ||
                        "Failed to start Playwright",
                    type: "error",
                },
            ]);
        }
    };

    const stopApplication = async () => {
        try {
            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

            await fetch(`${BACKEND_URL}/api/playwright/stop`, {
                method: "POST",
            });

            setStatus("stopped");
        } catch (error) {
            console.error("Failed to stop Playwright:", error);

            setStatus("error");

            setLogs((prev) => [
                ...prev,
                {
                    message:
                        error.message ||
                        "Failed to stop Playwright",
                    type: "error",
                },
            ]);
        }
    };

    return (
        <div className="body">
            <div className="fill-application">
                <h1>JobPilot</h1>

                <p>
                    Enter a job application URL to start autofilling.
                </p>

                <div className="job-url-section">
                    <input
                        type="text"
                        placeholder="https://company.com/careers/job..."
                        value={jobUrl}
                        onChange={(e) => setJobUrl(e.target.value)}
                        disabled={status === "running"}
                    />

                    {status !== "running" ? (
                        <Button onClick={startApplication}>
                            Start Autofill
                        </Button>
                    ) : (
                        <Button onClick={stopApplication}>
                            Stop
                        </Button>
                    )}
                </div>

                <div className="status">
                    <strong>Status:</strong>{" "}
                    <span className={`status-${status}`}>
                        {status}
                    </span>
                </div>

                <div className="logs">
                    <h2>Playwright Logs</h2>

                    <div className="log-window">
                        {logs.length === 0 ? (
                            <div className="empty-log">
                                Waiting for Playwright...
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div
                                    key={index}
                                    className={`log ${
                                        log.type || "info"
                                    }`}
                                >
                                    <span className="log-time">
                                        {log.time || ""}
                                    </span>

                                    <span className="log-message">
                                        {log.message}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FillApplication;