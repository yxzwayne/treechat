import os
import json
import psycopg2

with open("data_sample_extracted.json", "r") as f:
    data = json.load(f)

conn = psycopg2.connect(
    host="localhost", database="treechat", user="postgres", password="postgres"
)

cur = conn.cursor()
cur.execute("SELECT * FROM conversations")
test_results = cur.fetchall()
print("Found existing conversations:", len(test_results))

# if len(test_results) > 0:
#     print("Deleting existing conversations")
#     cur.execute("TRUNCATE messages")
#     cur.execute("TRUNCATE conversations CASCADE")
#     conn.commit()

for conv in data:
    # create a conversation
    print("--- --- --- ---")
    print(conv["uuid"])
    print(conv["name"])
    cur.execute(
        """
        INSERT INTO conversations (id, summary, created_at, updated_at, status)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """,
        (conv["uuid"], conv["name"], conv["created_at"], conv["updated_at"], "active"),
    )
    conn.commit()
    conv_id = cur.fetchone()[0]
    print(
        "Created conversation with the id %s and summary/name: %s",
        conv["uuid"],
        conv["name"],
    )

    conv_chat = conv["chat_messages"]
    print(len(conv_chat))
    prev_message_id = None
    for i in range(len(conv_chat)):
        message = conv_chat[i]
        m_id = message["uuid"]
        m_text = message["text"]
        m_content = message["content"][0]
        m_role = "user" if message["sender"] == "human" else "assistant"
        m_content["attachment"] = message["attachments"]
        m_files = message["files"]
        # create the message with the conversation id, set parent id to null if root, otherwise set to the previous message id
        cur.execute(
            """
            INSERT INTO messages (id, conversation_id, parent_id, role, text, content, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """,
            (
                m_id,
                conv_id,
                prev_message_id,
                m_role,
                m_text,
                json.dumps(m_content),
                message["created_at"],
                message["updated_at"],
            ),
        )
        conn.commit()
        prev_message_id = m_id

        # TODO: do not handle files for sample data
