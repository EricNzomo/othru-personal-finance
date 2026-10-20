import { useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://192.168.0.108:8000";

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseAmount(message) {
  const match = message.match(
    /\b(?:Ksh|KES)\s*([\d,]+(?:\.\d{1,2})?)/i
  );

  if (!match) {
    return "";
  }

  const amount = Number(match[1].replace(/,/g, ""));

  return Number.isFinite(amount) && amount > 0
    ? String(amount)
    : "";
}

function parseTransactionCode(message) {
  const match = message.match(
    /^\s*([A-Z0-9]{8,12})\s+(?=Confirmed\b)/i
  );

  return match ? match[1].toUpperCase() : "";
}

function parseTransactionType(message) {
  const normalizedMessage = message
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // 1. Reject reversals before classifying the transaction.
  const reversalPatterns = [
    /\breversal\b/i,
    /\breversed\b/i,
    /\btransaction reversed\b/i,
    /\bhas been reversed\b/i,
    /\breversal of\b/i,
  ];

  if (
    reversalPatterns.some((pattern) =>
      pattern.test(normalizedMessage)
    )
  ) {
    return "";
  }

  // 2. Recognize incoming money.
  const incomePatterns = [
    /\byou have received\b/i,
    /\byou received\b/i,
    /\breceived money from\b/i,
    /\baccount has been credited\b/i,
    /\baccount credited\b/i,
    /\bdeposited into your account\b/i,
    /\bpayment received\b/i,
    /\byou have been paid\b/i,
    /\bpayment from\b/i,
  ];

  if (
    incomePatterns.some((pattern) =>
      pattern.test(normalizedMessage)
    )
  ) {
    return "income";
  }

  // 3. Recognize outgoing payments, purchases and withdrawals.
  const expensePatterns = [
    /\byou sent\b/i,
    /\bsent to\b/i,
    /\byou have sent\b/i,
    /\byou paid\b/i,
    /\byou have paid\b/i,
    /\bpaid to\b/i,
    /\bpayment to\b/i,
    /\bmerchant payment\b/i,
    /\bbuy goods\b/i,
    /\bbought\b/i,
    /\bpurchase of\b/i,
    /\bairtime purchase\b/i,
    /\bairtime\b/i,
    /\bdata bundle\b/i,
    /\bbundles purchase\b/i,
    /\bpay bill\b/i,
    /\bpaybill\b/i,
    /\btill number\b/i,
    /\bwithdrawn\b/i,
    /\bwithdrawal\b/i,
    /\bwithdraw cash\b/i,
    /\btransaction cost\b/i,
    /\btransaction fee\b/i,
    /\btransaction charges?\b/i,
    /\bpay utility\b/i,
    /\brecharged\b/i,
  ];

  if (
    expensePatterns.some((pattern) =>
      pattern.test(normalizedMessage)
    )
  ) {
    return "expense";
  }

  // 4. Leave unrecognized messages unclassified.
  return "";
}

function parseTransactionDate(message) {
  const match = message.match(
    /\bon\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i
  );

  if (!match) {
    return getToday();
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) {
    year += 2000;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return getToday();
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}
function parseDescription(message, transactionType) {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();

  if (transactionType === "income") {
    const match = normalizedMessage.match(
      /\breceived\s+(?:Ksh|KES)\s*[\d,]+(?:\.\d{1,2})?\s+from\s+(.+?)(?=\s+\d{7,}|\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b|[.]|$)/i
    );

    if (match) {
      const sender = match[1]
        .replace(/\s+\d{4,}.*$/, "")
        .trim();

      return `M-Pesa received from ${sender}`;
    }

    return "M-Pesa received";
  }

  const paymentMatch = normalizedMessage.match(
    /\b(?:sent to|paid to|payment to)\s+(.+?)(?=\s+\d{7,}|\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b|[.]|$)/i
  );

  if (paymentMatch) {
    const recipient = paymentMatch[1]
      .replace(/\s+\d{4,}.*$/, "")
      .trim();

    return `M-Pesa payment to ${recipient}`;
  }

  const purchaseMatch = normalizedMessage.match(
    /\b(?:bought|buy goods|merchant payment|pay bill|paybill|withdrawn|withdrawal)\b(.+?)(?=\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b|[.]|$)/i
  );

  if (purchaseMatch) {
    return `M-Pesa ${purchaseMatch[0].trim()}`;
  }

  return "M-Pesa transaction";
}
function suggestExpenseCategory(message, categories) {
  const text = message.toLowerCase();

  const rules = [
    {
      category: "Airtime & Data",
      patterns: [
        /\bbought airtime\b/i,
        /\bairtime purchase\b/i,
        /\bdata bundle\b/i,
        /\bbundles purchase\b/i,
        /\bbought\b.*\bairtime\b/i,
      ],
    },
    {
      category: "Utilities",
      patterns: [
        /\bkplc\b/i,
        /\belectricity tokens?\b/i,
        /\bwater bill\b/i,
        /\bwater services\b/i,
      ],
    },
    {
      category: "Transport",
      patterns: [
        /\bfuel station\b/i,
        /\bpetrol station\b/i,
        /\bdiesel purchase\b/i,
        /\bparking fee\b/i,
      ],
    },
  ];

  for (const rule of rules) {
    const matches = rule.patterns.some((pattern) =>
      pattern.test(text)
    );

    if (matches) {
      const category = categories.find(
        (item) =>
          item.type === "expense" &&
          item.name.toLowerCase() === rule.category.toLowerCase()
      );

      if (category) {
        return {
          category_id: String(category.id),
          category_name: category.name,
          confidence: "high",
        };
      }
    }
  }

  return null;
}

function MpesaImport({
  categories = [],
  authHeaders = {},
  onSaved,
  showMessage,
  showError,
}) {
  const [sms, setSms] = useState("");
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const expenseCategories = categories.filter(
    (category) => category.type === "expense"
  );

  function updateTransaction(field, value) {
    setTransaction((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleParse(event) {
  event.preventDefault();

  setError("");
  setSuccess("");
  setTransaction(null);

  if (!sms.trim()) {
    setError("Paste an M-Pesa confirmation message first.");
    return;
  }

  const type = parseTransactionType(sms);

  console.log("M-PESA SMS:", sms);
  console.log("Detected transaction type:", type);

  const amount = parseAmount(sms);
  const code = parseTransactionCode(sms);
  const date = parseTransactionDate(sms);
  const description = parseDescription(sms, type || "expense");

  if (!amount) {
    setError(
      "Could not identify a valid amount. Check the SMS and try again."
    );
    return;
  }

  if (!type) {
    setError(
      "Could not identify whether this is income or an expense. Only recognized transaction messages can be imported automatically."
    );
    return;
  }

  const suggestion =
    type === "expense"
      ? suggestExpenseCategory(sms, expenseCategories)
      : null;

  setTransaction({
    transaction_type: type,
    amount,
    transaction_date: date,
    category_id: suggestion ? suggestion.category_id : "",
    suggested_category: suggestion ? suggestion.category_name : "",
    category_confidence: suggestion ? suggestion.confidence : "",
    source: "M-Pesa",
    description,
    notes: code ? `M-Pesa transaction code: ${code}` : "",
    transaction_code: code,
  });
}
  async function handleSave(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!transaction) {
      setError("Parse an M-Pesa message before saving.");
      return;
   }

   if (
    !transaction.amount ||
    !Number.isFinite(Number(transaction.amount)) ||
    Number(transaction.amount) <= 0
  ) {
    setError("Enter a valid amount greater than zero.");
    return;
  }

  if (
    !transaction.transaction_date) {
    setError("The transaction date is required.");
    return;
  }

  if (
    transaction.transaction_type === "expense" &&
    !transaction.category_id
  ) {
    setError("Select a category for this expense.");
    return;
  }

  if (
    transaction.transaction_type === "income" &&
    !transaction.source.trim()
  ) {
    setError("Enter the income source.");
    return;
  }

  setLoading(true);

  try {
    const isIncome = transaction.transaction_type === "income";
    const endpoint = isIncome ? "/income" : "/expenses";

    const payload = isIncome
      ? {
          income_date: transaction.transaction_date,
          amount: Number(transaction.amount),
          source: transaction.source.trim(),
          description: transaction.description.trim(),
          notes: transaction.notes.trim(),
          transaction_code: transaction.transaction_code || null,
        }
      : {
          transaction_date: transaction.transaction_date,
          amount: Number(transaction.amount),
          category_id: Number(transaction.category_id),
          description: transaction.description.trim(),
          notes: transaction.notes.trim(),
          transaction_code: transaction.transaction_code || null,
        };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(", ")
        : data.detail;

      throw new Error(
        detail ||
          `Unable to save the M-Pesa ${
            isIncome ? "income" : "expense"
          }.`
      );
    }

    setSuccess(
      `${isIncome ? "Income" : "Expense"} saved successfully.`
    );

    setSms("");
    setTransaction(null);

    if (typeof onSaved === "function") {
      await onSaved();
    }

    if (typeof showMessage === "function") {
      showMessage("M-Pesa transaction saved successfully.");
    }
  } catch (err) {
    setError(err.message || "An error occurred while saving.");

    if (typeof showError === "function") {
      showError(err.message || "An error occurred while saving.");
    }
  } finally {
    setLoading(false);
  }
}
  return (
    <section className="mpesa-import-section">
      <div className="section-heading">
        <div>
          <h2>M-Pesa SMS Import</h2>
          <p>
            Paste a confirmation SMS, review the extracted details, and
            save the transaction.
          </p>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message" role="status">
          {success}
        </div>
      )}

      <form onSubmit={handleParse} className="mpesa-parse-form">
        <div className="form-group">
          <label htmlFor="mpesa-sms">
            M-Pesa confirmation message
          </label>

          <textarea
            id="mpesa-sms"
            value={sms}
            onChange={(event) => {
              setSms(event.target.value);
              setError("");
              setSuccess("");
            }}
            placeholder="Paste your complete M-Pesa confirmation SMS here..."
            rows={5}
            required
          />
        </div>

        <button type="submit" className="primary-button">
          Parse SMS
        </button>
      </form>

    {transaction && (
  <form onSubmit={handleSave} className="mpesa-review-form">
    <h3>Review Transaction</h3>

    <p className="mpesa-review-note">
      Check every field before saving. The extracted information may need correction.
    </p>

    <div className="form-group">
      <label htmlFor="mpesa-type">Transaction type</label>
      <select
        id="mpesa-type"
        value={transaction.transaction_type}
        onChange={(event) => {
          updateTransaction("transaction_type", event.target.value);
          updateTransaction("category_id", "");
        }}
        required
      >
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
    </div>

    <div className="form-group">
      <label htmlFor="mpesa-amount">Amount (KES)</label>
      <input
        id="mpesa-amount"
        type="number"
        min="0.01"
        step="0.01"
        value={transaction.amount}
        onChange={(event) =>
          updateTransaction("amount", event.target.value)
        }
        required
      />
    </div>

    <div className="form-group">
      <label htmlFor="mpesa-date">Transaction date</label>
      <input
        id="mpesa-date"
        type="date"
        value={transaction.transaction_date}
        onChange={(event) =>
          updateTransaction("transaction_date", event.target.value)
        }
        required
      />
    </div>

    <div className="form-group">
      <label htmlFor="mpesa-transaction-code">
        M-PESA transaction code
      </label>
      <input
        id="mpesa-transaction-code"
        type="text"
        value={transaction.transaction_code || ""}
        onChange={(event) =>
          updateTransaction(
            "transaction_code",
            event.target.value.toUpperCase()
          )
        }
        placeholder="e.g. UJJ1IAMUO1"
        maxLength={20}
      />
      <small>
        Used to identify duplicate M-PESA transactions.
      </small>
    </div>

    {transaction.transaction_type === "expense" ? (
      <div className="form-group">
        <label htmlFor="mpesa-category">Expense category</label>
        <select
          id="mpesa-category"
          value={transaction.category_id}
          onChange={(event) =>
            updateTransaction("category_id", event.target.value)
          }
          required
        >
          <option value="">Select a category</option>
          {expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        {expenseCategories.length === 0 && (
          <small>
            No expense categories are available. Add categories before importing an expense.
          </small>
        )}
      </div>
    ) : (
      <div className="form-group">
        <label htmlFor="mpesa-source">Income source</label>
        <input
          id="mpesa-source"
          type="text"
          value={transaction.source}
          onChange={(event) =>
            updateTransaction("source", event.target.value)
          }
          placeholder="e.g. M-Pesa received from John"
          required
        />
      </div>
    )}

    <div className="form-group">
      <label htmlFor="mpesa-description">Description</label>
      <input
        id="mpesa-description"
        type="text"
        value={transaction.description}
        onChange={(event) =>
          updateTransaction("description", event.target.value)
        }
        required
      />
    </div>

    <div className="form-group">
      <label htmlFor="mpesa-notes">Notes</label>
      <textarea
        id="mpesa-notes"
        value={transaction.notes}
        onChange={(event) =>
          updateTransaction("notes", event.target.value)
        }
        rows={2}
      />
    </div>

    <div className="mpesa-review-actions">
      <button
        type="submit"
        className="primary-button"
        disabled={loading}
      >
        {loading ? "Saving..." : "Confirm and Save"}
      </button>

      <button
        type="button"
        className="secondary-button"
        disabled={loading}
        onClick={() => {
          setTransaction(null);
          setError("");
          setSuccess("");
        }}
      >
        Cancel
      </button>
    </div>
  </form>
)}

      <style>{`
        .mpesa-import-section {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid var(--viz-border, #d7dce2);
          border-radius: 12px;
        }

        .mpesa-import-section .section-heading {
          margin-bottom: 16px;
        }

        .mpesa-import-section .section-heading h2 {
          margin-top: 0;
          margin-bottom: 6px;
        }

        .mpesa-import-section .section-heading p,
        .mpesa-review-note {
          color: var(--viz-muted, #687385);
          font-size: 14px;
          line-height: 1.5;
        }

        .mpesa-import-section .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
          min-width: 0;
        }

        .mpesa-import-section label {
          font-weight: 600;
        }

        .mpesa-import-section input,
        .mpesa-import-section select,
        .mpesa-import-section textarea {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          padding: 10px 12px;
          border: 1px solid var(--viz-border, #cbd2dc);
          border-radius: 7px;
          font: inherit;
        }

        .mpesa-import-section textarea {
          resize: vertical;
        }

        .mpesa-review-form {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--viz-border, #d7dce2);
        }

        .mpesa-review-form h3 {
          margin-top: 0;
        }

        .mpesa-review-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .mpesa-import-section button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  );
}

export default MpesaImport;