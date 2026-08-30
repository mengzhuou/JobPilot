const { pool } = require("../config/postgres");
const createFeedback = async (userId,data) => (await pool.query(
    "INSERT INTO jobpilot.feedback(user_id,subject,message) VALUES($1,$2,$3) RETURNING *",
    [userId,data.subject,data.message]
)).rows[0];
const listFeedback = async () => (await pool.query(
    `SELECT f.*,u.email,u.display_name FROM jobpilot.feedback f JOIN jobpilot.users u ON u.id=f.user_id ORDER BY CASE f.status WHEN 'unread' THEN 0 WHEN 'read' THEN 1 ELSE 2 END,f.created_at DESC`
)).rows;
const updateFeedback = async (id,data) => (await pool.query(
    "UPDATE jobpilot.feedback SET status=$1,admin_note=$2,updated_at=NOW() WHERE id=$3::UUID RETURNING *",
    [data.status,data.adminNote || null,id]
)).rows[0];
const deleteFeedback = async id => (await pool.query(
    "DELETE FROM jobpilot.feedback WHERE id=$1::UUID RETURNING id",
    [id]
)).rows[0];
module.exports={createFeedback,listFeedback,updateFeedback,deleteFeedback};
