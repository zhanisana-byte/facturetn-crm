using System;
using System.Collections.Generic;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace FactureTN.Agent;

public class CertPickerForm : Form
{
    private readonly ListBox _list = new();
    private readonly Button _ok = new();
    private readonly Button _cancel = new();
    private readonly List<X509Certificate2> _certs;

    public X509Certificate2? Selected { get; private set; }

    public CertPickerForm(List<X509Certificate2> certs)
    {
        _certs = certs;

        Text = "Choisir le certificat (clé USB / store)";
        Width = 760;
        Height = 420;
        StartPosition = FormStartPosition.CenterScreen;

        _list.Dock = DockStyle.Top;
        _list.Height = 300;

        foreach (var c in _certs)
        {
            _list.Items.Add(Format(c));
        }

        _ok.Text = "Associer";
        _ok.Width = 120;
        _ok.Left = 500;
        _ok.Top = 320;
        _ok.Click += (_, _) =>
        {
            var idx = _list.SelectedIndex;
            if (idx < 0)
            {
                MessageBox.Show("Sélectionnez un certificat.");
                return;
            }

            Selected = _certs[idx];
            DialogResult = DialogResult.OK;
            Close();
        };

        _cancel.Text = "Annuler";
        _cancel.Width = 120;
        _cancel.Left = 620;
        _cancel.Top = 320;
        _cancel.Click += (_, _) =>
        {
            DialogResult = DialogResult.Cancel;
            Close();
        };

        Controls.Add(_list);
        Controls.Add(_ok);
        Controls.Add(_cancel);
    }

    private static string Format(X509Certificate2 c)
    {
        var subject = c.GetNameInfo(X509NameType.SimpleName, false);
        var issuer = c.GetNameInfo(X509NameType.SimpleName, true);
        return $"{subject}  |  Exp: {c.NotAfter:yyyy-MM-dd}  |  Serial: {c.SerialNumber}  |  Issuer: {issuer}";
    }
}
