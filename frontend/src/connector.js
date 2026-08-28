import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const openAndFillApplication = async (jobUrl) => {
    try {
        const res = await axios.post(
            `${BACKEND_URL}/api/applications/start`,
            {
                jobUrl,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        return res.data;
    } catch (error) {
        console.error(
            "Error opening and filling application:",
            error
        );
        throw error;
    }
};

const stopApplication = async () => {
    try {
        const res = await axios.post(
            `${BACKEND_URL}/api/applications/stop`
        );

        return res.data;
    } catch (error) {
        console.error("Error stopping application:", error);
        throw error;
    }
};

const getApplicationStatus = async () => {
    const res = await axios.get(
        `${BACKEND_URL}/api/applications/status`
    );

    return res.data;
};

export {
    openAndFillApplication,
    stopApplication,
    getApplicationStatus,
};
