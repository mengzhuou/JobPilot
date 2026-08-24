import React, { useEffect, useState } from "react";
import "./FillApplication.css";
import Button from "../../Button/Button";

const FillApplication = () => {
    const [jobUrl, setJobUrl] = useState("");
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState("idle");

    useEffect(() => {
        // Connect to Playwright log stream
        const eventSource = new EventSource("/api/playwright/logs");

        eventSource.onmessage = (event) => {
            const log = JSON.parse(event.data);

            setLogs((prev) => [...prev, log]);
            
            if (log.status) {
                setStatus(log.status);
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
            const response = await fetch("/api/playwright/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    jobUrl,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to start Playwright");
            }

            setStatus("running");
        } catch (error) {
            console.error(error);
            setStatus("error");

            setLogs((prev) => [
                ...prev,
                {
                    message: error.message,
                    type: "error",
                },
            ]);
        }
    };

    const stopApplication = async () => {
        try {
            await fetch("/api/playwright/stop", {
                method: "POST",
            });

            setStatus("stopped");
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="body">
            <div className="fill-application">
                <h1>JobPilot</h1>

                <p>Enter a job application URL to start autofilling.</p>

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
                                    className={`log ${log.type || "info"}`}
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