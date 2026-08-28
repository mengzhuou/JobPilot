import React, { useEffect, useState } from "react";
import "./FillApplication.css";
import Button from "../../Button/Button";
import {
    openAndFillApplication,
    stopApplication as stopApplicationAgent,
    getApplicationStatus,
} from "../../../connector.js";

const FillApplication = () => {
    const [jobUrl, setJobUrl] = useState("");
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState("idle");

    // Keep the UI synchronized when the Playwright page is
    // closed directly instead of through the Stop button.
    useEffect(() => {
        const syncStatus = async () => {
            try {
                const result = await getApplicationStatus();

                setStatus((current) =>
                    current === "idle" && !result.running
                        ? current
                        : result.status
                );
            } catch (error) {
                console.error(
                    "Failed to fetch application status:",
                    error
                );
            }
        };

        const statusTimer = setInterval(syncStatus, 1000);

        return () => {
            clearInterval(statusTimer);
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
            await stopApplicationAgent();

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
