using System;
using System.Security.Cryptography;
using System.Security.Cryptography.Xml;
using System.Security.Cryptography.X509Certificates;
using System.Xml;

namespace FactureTN.Agent;

internal static class XmlSigner
{
    /// <summary>
    /// Signature XML enveloped avec le certificat.
    /// - Déclenche le PIN au niveau CSP/minidriver si nécessaire.
    /// - Ne sauvegarde rien côté disque.
    /// 
    /// NOTE: les exigences exactes TTN peuvent imposer un profil de signature
    /// particulier (c14n, transforms, référence Id). Ce module est prêt à adapter.
    /// </summary>
    public static string SignEnveloped(string xml, X509Certificate2 cert)
    {
        if (string.IsNullOrWhiteSpace(xml)) throw new ArgumentException("XML vide");
        if (cert is null) throw new ArgumentNullException(nameof(cert));
        if (!cert.HasPrivateKey) throw new InvalidOperationException("Certificat sans clé privée");

        var doc = new XmlDocument
        {
            PreserveWhitespace = true
        };
        doc.LoadXml(xml);

        // Create SignedXml
        var signedXml = new SignedXml(doc);

        // Private key selection (RSA or ECDSA)
        AsymmetricAlgorithm? key = cert.GetRSAPrivateKey();
        if (key == null)
        {
            key = cert.GetECDsaPrivateKey();
        }
        if (key == null) throw new InvalidOperationException("Impossible d'obtenir la clé privée (RSA/ECDSA)");

        signedXml.SigningKey = key;

        // Reference whole document (enveloped)
        var reference = new Reference("");
        reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        reference.AddTransform(new XmlDsigC14NTransform());
        signedXml.AddReference(reference);

        // Include cert in KeyInfo
        var keyInfo = new KeyInfo();
        keyInfo.AddClause(new KeyInfoX509Data(cert));
        signedXml.KeyInfo = keyInfo;

        // Compute signature
        signedXml.ComputeSignature();

        // Append Signature element
        var xmlDigitalSignature = signedXml.GetXml();
        doc.DocumentElement?.AppendChild(doc.ImportNode(xmlDigitalSignature, true));

        return doc.OuterXml;
    }
}
