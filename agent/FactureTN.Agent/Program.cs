using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace FactureTN.Agent;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        try
        {
            if (args == null || args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
            {
                MessageBox.Show(
                    "FactureTN Agent est installé.\n\nLancez l’agent depuis FactureTN pour associer une clé.",
                    "FactureTN Agent",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                return;
            }

            var raw = args[0].Trim();
            if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
            {
                MessageBox.Show("URL invalide", "FactureTN Agent");
                return;
            }

            var scheme = uri.Scheme.ToLowerInvariant();
            if (scheme != "facturetn" && scheme != "facturetn-agent")
            {
                MessageBox.Show("Schéma non supporté", "FactureTN Agent");
                return;
            }

            var q = ParseQuery(uri.Query);

            string server = Get(q, "server");
            string token = Get(q, "token");
            string companyId = Get(q, "company_id");
            string env = Get(q, "env");

            if (string.IsNullOrWhiteSpace(server) ||
                string.IsNullOrWhiteSpace(token) ||
                string.IsNullOrWhiteSpace(companyId))
            {
                MessageBox.Show("Paramètres manquants", "FactureTN Agent");
                return;
            }

            server = server.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(env)) env = "production";

            var certs = ListCertificates();
            if (certs.Count == 0)
            {
                MessageBox.Show("Aucun certificat valide trouvé", "FactureTN Agent");
                return;
            }

            using var picker = new CertPickerForm(certs);
            if (picker.ShowDialog() != DialogResult.OK || picker.Selected == null)
            {
                MessageBox.Show("Opération annulée", "FactureTN Agent");
                return;
            }

            var selected = picker.Selected;

            RSA? rsa = selected.GetRSAPrivateKey();
            if (rsa == null)
            {
                ECDsa? ecdsa = selected.GetECDsaPrivateKey();
                if (ecdsa == null)
                    throw new Exception("Aucune clé privée RSA ou ECDSA accessible.");
            }

            var payload = new
            {
                token,
                company_id = companyId,
                environment = env,
                cert = new
                {
                    thumbprint = selected.Thumbprint,
                    serial_number = selected.SerialNumber,
                    subject = selected.Subject,
                    issuer = selected.Issuer,
                    not_before = selected.NotBefore,
                    not_after = selected.NotAfter
                }
            };

            using var http = new HttpClient();
            var resp = http.PostAsJsonAsync(
                $"{server}/api/signature/agent/pair",
                payload
            ).GetAwaiter().GetResult();

            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();

            if (!resp.IsSuccessStatusCode)
            {
                MessageBox.Show(body, "Erreur FactureTN Agent");
                return;
            }

            MessageBox.Show(
                "Clé associée avec succès",
                "FactureTN Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "FactureTN Agent");
        }
    }

    private static Dictionary<string, string> ParseQuery(string query)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(query)) return dict;
        if (query.StartsWith("?")) query = query[1..];

        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = part.Split('=', 2);
            var k = Uri.UnescapeDataString(kv[0]);
            var v = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : "";
            dict[k] = v;
        }
        return dict;
    }

    private static string Get(Dictionary<string, string> q, string key)
        => q.TryGetValue(key, out var v) ? v : "";

    private static List<X509Certificate2> ListCertificates()
    {
        var list = new List<X509Certificate2>();

        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly);

        foreach (var cert in store.Certificates)
        {
            try
            {
                if (!cert.HasPrivateKey) continue;
                if (DateTime.Now < cert.NotBefore || DateTime.Now > cert.NotAfter) continue;
                list.Add(cert);
            }
            catch { }
        }

        return list
            .GroupBy(c => c.Thumbprint)
            .Select(g => g.First())
            .OrderByDescending(c => c.NotAfter)
            .ToList();
    }
}
